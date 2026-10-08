export const MUSIC_LANES = [
  { key: 'mainstream', label: 'Pop / Top 40', searches: ['Billboard Hot 100 current chart', 'current US Top 40 songs chart'] },
  { key: 'hiphop-rnb', label: 'Hip-Hop / R&B', searches: ['current hip hop rap chart US', 'current R&B chart US'] },
  { key: 'dance-club', label: 'Dance / Club', searches: ['current dance electronic chart US', 'current house club tracks chart'] },
  { key: 'disco-funk', label: 'Disco / Funk / Throwbacks', searches: ['current disco funk DJ chart', 'popular disco funk party songs'] },
  { key: 'rock', label: 'Rock / Alternative', searches: ['current rock chart US', 'current alternative chart US'] },
  { key: 'country', label: 'Country', searches: ['Billboard Hot Country Songs current chart', 'Billboard Country Airplay current chart'] },
  { key: 'texas-red-dirt', label: 'Texas Country / Red Dirt', searches: ['Texas country current chart', 'Texas regional radio country chart current', 'Red Dirt country current chart'] },
  { key: 'latin', label: 'Latin / Tropical', searches: ['current Latin chart US', 'current salsa bachata merengue chart'] },
  { key: 'regional-mexican', label: 'Regional Mexican', searches: ['Billboard Regional Mexican current chart', 'current regional Mexican chart US'] },
  { key: 'tejano-conjunto', label: 'Tejano / Conjunto', searches: ['Tejano current music chart Texas', 'Conjunto current Texas radio chart'] },
  { key: 'norteno-cumbia', label: 'Norteño / Cumbia', searches: ['Norteño current chart Texas', 'Cumbia current chart Texas'] },
  { key: 'latin-urban', label: 'Reggaeton / Latin Urban', searches: ['current reggaeton chart', 'current Latin urban chart'] },
  { key: 'party-event', label: 'Party / Event / Singalongs', searches: ['current DJ party songs popular US', 'popular bar singalong songs current'] }
];

export const MUSIC_SUBGENRES = [
  'Pop', 'Top 40', 'Hip-Hop', 'R&B', 'Dance', 'EDM', 'House', 'Disco', 'Funk',
  'Rock', 'Alternative', 'Country', 'Texas Country', 'Red Dirt', 'Texas Regional',
  'Americana', 'Norteño', 'Cumbia', 'Salsa', 'Bachata', 'Duranguense', 'Zapateado',
  'Regional Mexican', 'Tejano', 'Conjunto', 'Banda', 'Corridos', 'Corridos Tumbados',
  'Ranchera', 'Mariachi', 'Reggaeton', 'Latin Urban', 'Merengue', 'Tropical',
  'Throwbacks', 'Bar Anthems', 'Wedding/Event'
];

export const MUSIC_INTELLIGENCE_INSTRUCTIONS = `
You are SI DJ Music Intelligence, a current-music research assistant for working DJs.
Research CURRENT music charts, radio charts, regional charts, and reputable music sources on the web.
This snapshot is pulled when a DJ starts a session and then cached; it must represent the latest information you can verify now.

Priority:
1. Billboard national charts for mainstream, country, hip-hop/R&B, rock, dance and regional Mexican where applicable.
2. Texas-specific and Texas-radio sources for Texas Country, Red Dirt, Texas Regional, Tejano and Conjunto.
3. Reputable current sources for Latin, Norteño, Cumbia, Salsa, Bachata, Reggaeton and club/dance.
4. Current popular party/bar/event records where useful.

Do not invent chart positions, songs, dates, or sources. If a niche chart is unavailable, say so and use the best reputable current source for that lane.
Treat Texas Country/Red Dirt and Tejano/Conjunto as distinct Texas music lanes.
Include chart date or "current as checked" when the source does not publish a date.

Return ONLY valid JSON:
{
  "snapshot_date": "YYYY-MM-DD",
  "generated_at": "ISO timestamp",
  "lanes": [
    {
      "key": "lane key from supplied list",
      "label": "lane label",
      "status": "verified|partial|unavailable",
      "source_names": ["source"],
      "source_urls": ["https://..."],
      "items": [
        {
          "rank": 1,
          "title": "song",
          "artist": "artist",
          "chart": "chart/list name",
          "position": "1 or descriptive position",
          "trend": "up|down|steady|new|unknown",
          "note": "short DJ-useful note"
        }
      ]
    }
  ]
}
Return up to 8 useful current items per lane. Prefer fewer verified items over fabricated filler.
`;

export async function fetchMusicIntelligence(client, model = process.env.OPENAI_MODEL || 'gpt-6-luna') {
  const laneBrief = MUSIC_LANES.map((lane) => ({
    key: lane.key,
    label: lane.label,
    searches: lane.searches
  }));

  const response = await client.responses.create({
    model,
    tools: [{ type: 'web_search' }],
    instructions: MUSIC_INTELLIGENCE_INSTRUCTIONS,
    input: `Research these DJ music lanes now. Use web search and return only the requested JSON.\n\nLANES:\n${JSON.stringify(laneBrief)}`,
    max_output_tokens: 9000
  });

  const raw = String(response.output_text || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/i, '');
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.lanes)) throw new Error('music_intelligence_invalid');
  return {
    snapshot_date: data.snapshot_date || new Date().toISOString().slice(0, 10),
    generated_at: data.generated_at || new Date().toISOString(),
    lanes: MUSIC_LANES.map((lane) => {
      const found = data.lanes.find((x) => x && x.key === lane.key) || {};
      return {
        key: lane.key,
        label: lane.label,
        status: ['verified', 'partial', 'unavailable'].includes(found.status) ? found.status : 'partial',
        source_names: Array.isArray(found.source_names) ? found.source_names.slice(0, 5) : [],
        source_urls: Array.isArray(found.source_urls) ? found.source_urls.slice(0, 5) : [],
        items: Array.isArray(found.items) ? found.items.slice(0, 8).map((x, i) => ({
          rank: Number(x.rank) || i + 1,
          title: String(x.title || '').trim(),
          artist: String(x.artist || '').trim(),
          chart: String(x.chart || '').trim(),
          position: String(x.position || '').trim(),
          trend: String(x.trend || 'unknown').trim(),
          note: String(x.note || '').trim()
        })).filter((x) => x.title && x.artist) : []
      };
    })
  };
}
