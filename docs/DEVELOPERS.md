# Magic Imger — документация для разработчиков

Этот документ — “карта проекта” для тех, кто хочет расширять код: где что лежит, какие потоки данных есть, куда вносить изменения.

## Структура репозитория

```text
src/
  core/                 # доменная логика (ядро)
  cli/                  # CLI-обвязка над core / mac \ linux 
  ui/windows/           # Electron UI (renderer + main + preload) / Гигачед окно для винды) 
  shared/               # общие типы и константы
docs/
  ARCHITECTURE.md       # принципы и слойность
  USER_GUIDE.md         # пользовательская инструкция
```

Главный принцип: **`core` не зависит от UI/CLI**. UI и CLI — тонкие адаптеры.

## Image pipeline: как устроена обработка изображений

### 1) Планирование (`planBatch`)

Точка входа: `src/core/planner.ts`.

Поток:

1. `readInputAssets()` (`src/core/intake.ts`) — читает метаданные файлов и формирует `InputAsset[]`.
2. `createPreflightEstimate()` (`src/core/estimator.ts`) — оценивает RAM/время и предупреждения.
3. `assertEstimateFitsProfile()` (`src/core/resources.ts`) — safe/balanced бюджет.
4. `buildJobs()` (`src/core/planner.ts`) — строит список `ResolvedJob[]`:
   - учитывает глобальные настройки;
   - применяет `itemOverrides` (если переданы).

Выход `planBatch()`:

- `assets`
- `estimate`
- `jobs`
- `concurrency` (берётся из resource profile)

### 2) Выполнение (`processBatch`)

Точка входа: `src/core/pipeline.ts`.

- `processImage(job)` применяет `resize` и `targetFormat` (через `sharp`) и сохраняет файл.
- `processBatch(jobs, concurrency)` запускает несколько воркеров и возвращает `BatchJobResult[]`.

## Скриншоты (URL screenshots): как устроено

Точки входа:

- CLI: `src/cli/index.ts` команда `shoot`
- GUI: Electron main handler (`src/ui/windows/main.ts`) вызывает `runShotBatch`

Поток:

1. `runShotBatch()` (`src/core/screenshots/run-shot-batch.ts`) создаёт папку батча и гоняет URL по одному.
2. `makeShot()` (`src/core/screenshots/make-shot.ts`) для каждого URL:
   - запускает/подключает браузер через `resolveScreenshotBrowser()` (`src/core/screenshots/browser.ts`);
   - грузит страницу и ждёт стабилизации;
   - делает `shots` кадров, сдвигая scroll по диапазону `0..maxScrollY`;
   - (опционально) делает несколько `copiesPerScreen` повторов;
   - сохраняет PNG и (опционально) ужимает их до `maxImageBytes` best-effort.

Важно про `shots`: **это целевое количество кадров на URL**, не привязанное к “высоте экрана” (дубли на коротких страницах допустимы).

## Где менять код, если хочется расширений

### Добавить новую операцию обработки изображений

Рекомендуемый порядок:

1. Описать/расширить типы в `src/shared/types.ts` (что будет параметрами операции).
2. На уровне планирования:
   - добавить параметры в `PlanJobsOptions` (`src/core/planner.ts`);
   - прокинуть их в `ResolvedJob` (через `buildJobs()`), с учётом per-item override.
3. На уровне выполнения:
   - реализовать применение операции в `src/core/pipeline.ts` (в `processImage`).
4. Добавить CLI-опцию/команду в `src/cli/index.ts` (тонкая валидация и проброс в `core`).
5. (Опционально) добавить UI-контролы в `src/ui/windows/app/App.tsx` и прокинуть в bridge.
6. Покрыть тестами (Vitest) в `tests/`.

### Добавить/изменить параметры скриншотов

1. Типы: `ScreenshotJobOptions` / `ScreenshotBatchOptions` (`src/shared/types.ts`).
2. Бизнес-логика: `src/core/screenshots/make-shot.ts` (или `browser.ts` если про запуск браузера).
3. Интеграции:
   - CLI: `src/cli/index.ts` команда `shoot`
   - GUI: `src/ui/windows/app/App.tsx` + IPC (`src/ui/windows/preload.ts` / `src/ui/windows/main.ts`)

## Тесты и проверки

```bash
npm test
npm run typecheck
```

Если добавляешь новый модуль `core`, старайся держать его независимым от Electron/React и покрывать unit-тестами.

