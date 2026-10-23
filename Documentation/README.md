# cercit documentation

Reference for the cercit repo and database, as of 23 Oct 2026. Everything here describes synthetic demo data; no real customer data is stored.

| File | What it covers |
|---|---|
| [01-folder-guide.md](01-folder-guide.md) | Every folder in the repo and every file in it, with a one-line note |
| [02-database-schema.md](02-database-schema.md) | All 102 tables in 12 areas: purpose, every column, keys, allowed values, relationships |
| [03-relationships-and-cardinality.md](03-relationships-and-cardinality.md) | What cardinality means, diagrams per area, all 122 foreign keys with their cardinality |
| [04-scheme-design.md](04-scheme-design.md) | The live car loan scheme: bureau bands, employer categories, the 16 rules, parameters, and the Aug template compared with live |
| [05-database-functions.md](05-database-functions.md) | All 286 database functions |
| [cercit-database-schema.xlsx](cercit-database-schema.xlsx) | The schema as a workbook: tables, columns, relationships, link tables, functions |
| [cercit-scheme-design.xlsx](cercit-scheme-design.xlsx) | The scheme as a workbook |

## How this was made

- The schema comes from loading every migration (`sql/001` to `sql/095`) into a local Postgres, then reading the catalogue. The table list and every table's column count were checked against the live Supabase project on 23 Oct 2026.
- Cardinality is worked out from the keys: a foreign key that is also unique is one-to-one; otherwise one-to-many. A NOT NULL foreign key means the parent is required. A table whose key is two foreign keys is a many-to-many link.
- The scheme values were read from the live database (active policy version and rate grid).
- Column descriptions come from the migrations. Where a migration says nothing about a column, the description is based on its name.

These replace the August 2026 templates `docs/db_schema_template.xlsx` (22 tables) and `docs/scheme_design_template.xlsx`/`.csv`, which are kept for history.

## Related

- `behind-the-scenes/how-it-works/`: plain-language guide to flows and components.
- `docs/migration-run-log.md`: when each migration ran on the live database.
- `docs/compliance-map.md`: how the build maps to RBI and DPDP rules.
- `docs/model-governance.md`: the risk model inventory and controls.
