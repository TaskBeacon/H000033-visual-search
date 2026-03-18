# H000033 Visual Search Task

HTML/browser preview of Visual Search Task built with `psyflow-web`.
Feature vs conjunction display generation, present/absent key mapping, and block/session summary metrics are aligned to local `T000033-visual-search`.

## Layout

- `main.ts`: block scheduling and task mounting
- `config/config.yaml`: declarative config, including `condition_generation`
- `src/run_trial.ts`: trial realization
- `src/utils.ts`: pure trial-spec generation plus block/overall summaries

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000033-visual-search
```
