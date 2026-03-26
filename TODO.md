# TODO / Implementation Spec

Рабочий документ для реализации MVP по TDD.

## Принципы

- сначала тест;
- потом минимальная реализация;
- потом рефакторинг;
- не писать GUI и CLI поверх несуществующего ядра;
- каждая итерация должна оставлять проект в рабочем состоянии.

## Итерация 1: Foundation

- [x] Зафиксировать документацию проекта
- [x] Зафиксировать ресурсные профили `safe` и `balanced`
- [x] Поднять `TypeScript` + `Vitest`
- [x] Добавить базовые типы домена
- [x] Добавить `core/resources.ts`
- [x] Добавить `core/estimator.ts`
- [x] Покрыть resource profiles тестами
- [x] Покрыть preflight estimate тестами

## Итерация 2: File Intake

- [x] Описать `InputAsset`, `ResolvedJob`, `PreflightEstimate`
- [x] Реализовать чтение metadata входных файлов
- [x] Ограничить очередь до `100` файлов
- [x] Добавить fail-fast в safe mode при прогнозе выше `1 GB RAM`
- [x] Добавить стратегию именования output paths

## Итерация 3: Processing Core

- [x] Реализовать `resize`
- [x] Реализовать `compress`
- [x] Реализовать `convert`
- [x] Реализовать batch executor c ограничением конкурентности
- [x] Покрыть happy path и file-level failure тестами

## Итерация 4: CLI

- [x] Поднять CLI-команды `resize`, `compress`, `convert`
- [x] Добавить `--resource-profile`
- [x] Добавить preflight summary в CLI
- [x] Добавить smoke tests для CLI

## Итерация 5: Windows GUI

- [x] Поднять Electron shell
- [x] Поднять renderer UI
- [x] Добавить очередь файлов
- [x] Добавить drag and drop
- [x] Добавить clipboard import
- [x] Добавить inspector общих и индивидуальных настроек
- [x] Добавить preflight summary перед запуском
- [x] Добавить `Allow more resources` с явными лимитами

## Definition of Done для текущей итерации

- [x] есть тестовый контур
- [x] есть первые unit-тесты
- [x] тесты проходят
- [x] код соответствует текущему ТЗ по safe mode и preflight estimate
