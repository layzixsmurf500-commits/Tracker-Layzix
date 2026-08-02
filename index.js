require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// ---------- CONFIG ----------
const {
  DISCORD_TOKEN,
  CHANNEL_ID,
  BRAWL_API_KEY,
  TARGET_TAGS,
  POLL_INTERVAL_SECONDS = 60,
  USE_DIRECT_API = 'false',
} = process.env;

if (!DISCORD_TOKEN || !CHANNEL_ID || !BRAWL_API_KEY || !TARGET_TAGS) {
  console.error('❌ Il manque des variables dans le fichier .env (voir .env.example)');
  process.exit(1);
}

const API_BASE = USE_DIRECT_API === 'true'
  ? 'https://api.brawlstars.com/v1'
  : 'https://bsproxy.royaleapi.dev/v1';

const tags = TARGET_TAGS.split(',').map(t => t.trim()).filter(Boolean);
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// ---------- HELPERS ----------
function normalizeTag(tag) {
  // L'API veut le # encode en %23, sans espace, en majuscules
  const clean = tag.trim().toUpperCase().replace('#', '');
  return `%23${clean}`;
}

function seenFilePath(tag) {
  return path.join(DATA_DIR, `${tag.replace('#', '')}.json`);
}

function loadSeen(tag) {
  const file = seenFilePath(tag);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function saveSeen(tag, seenList) {
  // On garde seulement les 60 dernieres battleTime pour ne pas grossir a l'infini
  const trimmed = seenList.slice(-60);
  fs.writeFileSync(seenFilePath(tag), JSON.stringify(trimmed, null, 2));
}

const api = axios.create({
  baseURL: API_BASE,
  headers: { Authorization: `Bearer ${BRAWL_API_KEY}` },
  timeout: 15000,
});

async function fetchBattleLog(tag) {
  const res = await api.get(`/players/${normalizeTag(tag)}/battlelog`);
  return res.data.items || [];
}

async function fetchPlayer(tag) {
  const res = await api.get(`/players/${normalizeTag(tag)}`);
  return res.data;
}

// ---------- EMBED BUILDING ----------
const RESULT_COLOR = {
  victory: 0x57f287, // vert
  defeat: 0xed4245,  // rouge
  draw: 0x99aab5,    // gris
};

const RESULT_LABEL_FR = {
  victory: 'Victoire',
  defeat: 'Défaite',
  draw: 'Égalité',
};

function formatPlayerLine(p, isTarget) {
  const brawler = p.brawler ? `${p.brawler.name} | ${p.brawler.trophies}` : '?';
  const line = `${p.name} (#${(p.tag || '').replace('#', '')} | ${brawler})`;
  return isTarget ? `**➤ ${line}**` : `• ${line}`;
}

function buildMatchEmbed(battleEntry, targetTag) {
  const battle = battleEntry.battle || {};
  const eventInfo = battleEntry.event || {};
  const mode = battle.mode || eventInfo.mode || 'Inconnu';
  const mapName = eventInfo.map || 'Inconnue';

  // battle.result n'existe que sur les modes par equipe / 1v1 direct.
  // Pour les modes en classement (showdown), on deduit via battle.rank.
  let result = battle.result;
  if (!result && typeof battle.rank === 'number') {
    result = battle.rank <= 2 ? 'victory' : 'defeat';
  }
  if (!result) result = 'draw';

  const color = RESULT_COLOR[result] ?? RESULT_COLOR.draw;
  const resultLabel = RESULT_LABEL_FR[result] ?? 'Résultat inconnu';

  let teamLines = [];
  let enemyLines = [];

  if (Array.isArray(battle.teams) && battle.teams.length >= 2) {
    const targetClean = targetTag.replace('#', '').toUpperCase();
    const teamWithTarget = battle.teams.find(team =>
      team.some(p => (p.tag || '').replace('#', '').toUpperCase() === targetClean)
    );
    const otherTeams = battle.teams.filter(team => team !== teamWithTarget);

    if (teamWithTarget) {
      teamLines = teamWithTarget.map(p =>
        formatPlayerLine(p, (p.tag || '').replace('#', '').toUpperCase() === targetClean)
      );
    }
    otherTeams.forEach(team => {
      team.forEach(p => enemyLines.push(formatPlayerLine(p, false)));
    });
  } else if (Array.isArray(battle.players)) {
    // Modes solo (ex: showdown solo) : tout le monde dans une seule liste
    const targetClean = targetTag.replace('#', '').toUpperCase();
    teamLines = battle.players
      .filter(p => (p.tag || '').replace('#', '').toUpperCase() === targetClean)
      .map(p => formatPlayerLine(p, true));
    enemyLines = battle.players
      .filter(p => (p.tag || '').replace('#', '').toUpperCase() !== targetClean)
      .map(p => formatPlayerLine(p, false));
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('⚔️ Brawl Stars Match')
    .addFields(
      { name: '🗺️ Map', value: mapName || 'Inconnue', inline: false },
      { name: '🔍 Target Player', value: `${targetTag}`, inline: false },
      { name: '🏆 Result', value: resultLabel, inline: false },
      { name: '🎯 Mode', value: mode, inline: false },
    );

  if (teamLines.length) {
    embed.addFields({ name: '👤 Team', value: teamLines.join('\n') || '—', inline: false });
  }
  if (enemyLines.length) {
    embed.addFields({ name: '⚔️ Enemies', value: enemyLines.join('\n') || '—', inline: false });
  }

  embed.setTimestamp(new Date(parseBattleTime(battleEntry.battleTime)));
  return embed;
}

function parseBattleTime(bsTime) {
  // Format Brawl Stars: "20260630T220100.000Z" -> ISO valide
  if (!bsTime) return Date.now();
  const iso = bsTime.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
    '$1-$2-$3T$4:$5:$6'
  );
  const d = new Date(iso);
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

// ---------- DISCORD CLIENT ----------
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

async function checkTag(tag, channel) {
  try {
    const log = await fetchBattleLog(tag);
    const seen = loadSeen(tag);

    // Nouvelles games = battleTime pas encore vus, en partant des plus anciennes
    // vers les plus recentes pour poster dans l'ordre chronologique.
    const newBattles = log
      .filter(b => !seen.includes(b.battleTime))
      .reverse();

    for (const battleEntry of newBattles) {
      const embed = buildMatchEmbed(battleEntry, tag);
      await channel.send({ embeds: [embed] });
      seen.push(battleEntry.battleTime);
    }

    if (newBattles.length) {
      saveSeen(tag, seen);
      console.log(`✅ ${newBattles.length} nouvelle(s) game(s) postee(s) pour ${tag}`);
    }
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      console.error(`❌ Tag ${tag} introuvable (verifie le tag dans .env)`);
    } else if (status === 403) {
      console.error(`❌ Cle API refusee (403) pour ${tag}. Verifie ta cle / IP whitelistee sur developer.brawlstars.com`);
    } else {
      console.error(`❌ Erreur pour ${tag}:`, err.message);
    }
  }
}

client.once('ready', async () => {
  console.log(`🤖 Connecte en tant que ${client.user.tag}`);
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) {
    console.error('❌ Salon Discord introuvable, verifie CHANNEL_ID');
    process.exit(1);
  }

  // Premier passage : on marque juste les games existantes comme "vues"
  // pour ne pas spammer tout l'historique au demarrage.
  for (const tag of tags) {
    const seen = loadSeen(tag);
    if (seen.length === 0) {
      try {
        const log = await fetchBattleLog(tag);
        saveSeen(tag, log.map(b => b.battleTime));
        console.log(`ℹ️ Initialisation de ${tag} : ${log.length} games marquees comme deja vues.`);
      } catch (err) {
        console.error(`❌ Impossible d'initialiser ${tag}:`, err.message);
      }
    }
  }

  console.log(`🔄 Polling toutes les ${POLL_INTERVAL_SECONDS}s pour : ${tags.join(', ')}`);
  setInterval(() => {
    tags.forEach(tag => checkTag(tag, channel));
  }, Number(POLL_INTERVAL_SECONDS) * 1000);
});

client.login(DISCORD_TOKEN);
