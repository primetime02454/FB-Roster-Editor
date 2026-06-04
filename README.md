# FB Roster Editor Web App

A full-stack FB Roster Editor starter app for the football roster database format used by the attached `mroster_260_156.db`.

It includes:

- FastAPI backend parser/API
- React/Vite frontend editor
- Upload/open roster DB files
- Parse and display all discovered tables in a database-style tab/table view
- PLAY/Players table editing
- TEAM table editing
- DCHT, TCPS, BLBM and other discovered table exports
- Character Visuals nested JSON parser
- Character Visuals flattened CSV exports for players, loadouts, loadout elements, and blends
- Team-name and position-friendly columns where `TGID` / `PPOS` are available
- Table search
- Find and replace
- Copy / paste grid data
- Undo / redo for cell edits
- Node JSON editor for raw table JSON and full Character Visuals JSON
- **Save DB / Save As DB** binary `.db` rebuild for roster tables and Character Visuals
- **Save As JSON** complete project JSON export
- Export table CSV/JSON
- Export full session ZIP

## Binary save status

The app now includes the encoder/rebuilder path for both the main roster DB tables and the large Character Visuals block:

- Rebuilds the editable main roster tables from session JSON:
  - `BLOB.BLBM`
  - `BLOB.DCHT`
  - `BLOB.PLAY`
  - `BLOB.TCPS`
  - `BLOB.TEAM`
- Rebuilds the large Character Visuals `BLBM` block from `character_visuals_nested.json`.
- Encodes CHVI visual records, including nested `loadouts`, `loadoutElements`, and `blends`.
- Converts friendly visual enums back to binary values, including `slotType`, `loadoutType`, and `loadoutCategory`.
- Gzip-compresses each rebuilt visual record and recalculates modified LEB lengths/counts.
- Validates the generated `.db` by parsing the roster tables and Character Visuals again before download.

`Save As JSON` is still separate and downloads a complete editable project JSON containing tables plus Character Visuals.

## Quick start on Windows

### One-command browser launch

Run:

```bat
start_windows.bat
```

That will:

- build the frontend
- start the FastAPI server
- open the app in your browser at `http://127.0.0.1:8000`

### Desktop window launch

Run:

```bat
run_desktop.bat
```

That will:

- build the frontend
- start the local API/server
- open the app in its own desktop window using `pywebview`

### Build a Windows EXE

Run:

```bat
build_desktop_exe.bat
```

The generated executable will be placed at:

```text
backend\dist\FB Roster Editor\FB Roster Editor.exe
```

### Manual development mode

1. Install Python 3.11+ and Node.js 20+.
2. Open **Command Prompt** in this folder.
3. Run the backend:

```bat
cd backend
run_backend.bat
```

4. Open another **Command Prompt** in this folder.
5. Run the frontend:

```bat
cd frontend
run_frontend.bat
```

6. Open:

```text
http://127.0.0.1:5173
```

You can use **Open Sample** to parse the bundled sample file at `sample/mroster_260_156.db`, or use **Open** to upload another roster DB.

## Quick start on macOS/Linux

```bash
cd backend
./run_backend.sh
```

In another terminal:

```bash
cd frontend
./run_frontend.sh
```

Then open `http://127.0.0.1:5173`.

## Save/export buttons

- **Save DB** — downloads a rebuilt Madden `.db` file using current table edits and Character Visuals JSON edits.
- **Save As DB** — same browser-download behavior as Save DB.
- **Save As JSON** — downloads a complete editable project JSON containing parsed tables and Character Visuals JSON.
- **CSV / JSON** — exports the currently selected table.
- **Export All ZIP** — exports the full session folder with tables, visuals, summaries, and logs.

## Backend API summary

- `POST /api/parse` — upload and parse a roster DB
- `POST /api/parse-sample` — parse bundled sample DB
- `GET /api/session/{session_id}` — session summary and table list
- `GET /api/session/{session_id}/table/{table_path}` — paged table rows
- `PATCH /api/session/{session_id}/cell` — edit a table cell
- `POST /api/session/{session_id}/paste` — paste grid cells
- `POST /api/session/{session_id}/replace` — find/replace inside a table
- `GET /api/session/{session_id}/visuals` — paged Character Visuals records
- `GET /api/session/{session_id}/visuals-json` — full nested Character Visuals JSON
- `PUT /api/session/{session_id}/visuals-json` — replace nested Character Visuals JSON and regenerate CSVs
- `GET /api/session/{session_id}/save-roster.db` — rebuild and download edited binary `.db`
- `GET /api/session/{session_id}/save-project.json` — download complete project JSON
- `GET /api/session/{session_id}/export/all.zip` — full parsed/exported project ZIP

## File layout

```text
backend/
  app/main.py                            FastAPI API and session/export/edit logic
  app/parsers/parse_madden_tdb2.py        TDB2/H2 roster parser
  app/parsers/parse_h2_visuals_json.py    Character Visuals parser
  app/parsers/rebuild_madden_tdb2.py      Binary encoder/rebuilder
  app/parsers/encode_h2_visuals.py         Character Visuals CHVI encoder
frontend/
  src/main.jsx                            React editor UI
  src/styles.css                          App styling
sample/
  mroster_260_156.db                      Bundled sample roster
```

## Current limitation / testing note

The app can now rebuild Character Visuals back into the binary file, but this is still a custom reverse-engineered encoder. Test rebuilt files in-game or in your preferred Madden/Frosty workflow before overwriting an original roster. Keep backups of original `.db` files.
