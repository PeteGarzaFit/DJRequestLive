# Master DJ Library Inventory

DJ Request Live now has a separate source-of-truth inventory layer for each DJ.

## What the inventory represents

The master scan is intentionally **one row per physical/library file**. Artist/title duplicates are not deduplicated because different copies can be different edits, formats, encodes, clean/explicit versions, remixes, or other DJ-useful variants.

The imported source fields are preserved exactly:

- Artist
- Title
- Album
- Genre
- BPM
- Year
- File type
- Duration
- Exact file path
- Metadata source

The database also stores derived, non-destructive search keys for artist/title matching and a SHA-256 hash of the exact file path.

## Production tables

- `library_scans` — records each imported master scan and its SHA-256 checksum.
- `library_tracks` — the current complete inventory for each DJ.
- Older scan records remain for auditability; `library_tracks` is the current source-of-truth snapshot.

## Import

Do **not** commit the master inventory text file to GitHub. It contains the DJ's local filesystem paths.

On the DJ's Mac, with the production database environment configured:

```bash
MASTER_INVENTORY_FILE="/path/to/DJ_Request_Live_Master_Inventory.txt" \
DJ_EMAIL="your-account-email" \
npm run inventory:import
```

Or:

```npm run inventory:import -- --file "/path/to/DJ_Request_Live_Master_Inventory.txt" --email "your-account-email"```

The importer:

1. Parses the source header and every inventory row.
2. Preserves every file/version.
3. Converts BPM, year and duration into queryable numeric fields where the source provides valid values.
4. Creates non-destructive normalized artist/title keys.
5. Computes a path hash so the same exact file path cannot be inserted twice.
6. Replaces only that DJ's current inventory inside a MySQL transaction.
7. Records the scan metadata and source SHA-256.
8. Does not alter the source text file.

## API foundation

Authenticated DJ endpoints are available for the next SI DJ layer:

- `GET /api/library/summary`
- `GET /api/library/search?q=...`
- Optional filters: `artist`, `genre`, `file_type`, `limit`

This keeps the actual DJ library separate from the curated SI DJ knowledge base in `songs`. SI DJ can therefore answer the critical distinction:

**"Does this DJ actually own this track/file?"**

without treating a generic curated song list as proof of inventory.
