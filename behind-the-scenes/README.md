# Behind the scenes

The working material behind cercit: data and results that went into the product but aren't part of the app itself.

| Folder | What it is |
|---|---|
| [`how-it-works/`](how-it-works/) | **How cercit works**: flow charts for each stage, the database schema, every migration and database function, the parts of the system, a glossary. Start at its README. |
| [`how-it-works/where-things-live.md`](how-it-works/where-things-live.md) | **Where everything lives**: each model and engine, where it runs, where the data is kept, and the team (Claude as chief architect, plus the tools that helped). |
| [`synthetic-training-data/`](synthetic-training-data/) | **Synthetic.** 16,995 made-up customers assessed by the credit engine, with simulated repayment outcomes. Used to train risk model v2 (Oct 2026). No real people. |

Everything here is documentation, or synthetic data and results derived from it. Real customer data never goes in this repository.
