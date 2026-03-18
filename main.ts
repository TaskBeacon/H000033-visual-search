import {
  BlockUnit,
  StimBank,
  SubInfo,
  TaskSettings,
  TrialBuilder,
  count_down,
  mountTaskApp,
  next_trial_id,
  parsePsyflowConfig,
  reset_trial_counter,
  type CompiledTrial,
  type Resolvable,
  type RuntimeView,
  type StimRef,
  type StimSpec,
  type TrialSnapshot
} from "psyflow-web";

import configText from "./config/config.yaml?raw";
import { run_trial } from "./src/run_trial";
import { summarizeBlock, summarizeOverall } from "./src/utils";

function buildWaitTrial(
  meta: { trial_id: string; condition: string; trial_index: number },
  blockId: string | null,
  unitLabel: string,
  stimInputs: Array<Resolvable<StimRef | StimSpec | null>>
): CompiledTrial {
  const trial = new TrialBuilder({
    trial_id: meta.trial_id,
    block_id: blockId,
    trial_index: meta.trial_index,
    condition: meta.condition
  });
  trial.unit(unitLabel).addStim(...stimInputs).waitAndContinue();
  return trial.build();
}

function normalizeConditionLabel(condition: string): string {
  const value = String(condition ?? "").trim().toLowerCase();
  return value.length > 0 ? value : "feature_present";
}

function resolveTrialPerBlock(settings: TaskSettings): number {
  const configured = Number(settings.trial_per_block ?? settings.trials_per_block ?? 0);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.trunc(configured));
  }
  const totalBlocks = Math.max(1, Number(settings.total_blocks ?? 1));
  const totalTrials = Math.max(1, Number(settings.total_trials ?? totalBlocks));
  return Math.max(1, Math.ceil(totalTrials / totalBlocks));
}

function resolveBlockSeed(settings: TaskSettings, blockIndex: number): number {
  const blockSeeds = Array.isArray(settings.block_seed) ? settings.block_seed : [];
  const candidate = Number(blockSeeds[blockIndex]);
  if (Number.isFinite(candidate)) {
    return Math.trunc(candidate);
  }
  const fallback = Number(settings.overall_seed ?? 2025);
  return Number.isFinite(fallback) ? Math.trunc(fallback) : blockIndex + 1;
}

export async function run(root: HTMLElement): Promise<void> {
  const parsed = parsePsyflowConfig(configText, import.meta.url);
  const settings = TaskSettings.from_dict(parsed.task_config);
  const subInfo = new SubInfo(parsed.subform_config);
  const stimBank = new StimBank(parsed.stim_config);
  const conditionGenerationConfig = (parsed.raw.condition_generation ?? {}) as Record<string, unknown>;

  settings.triggers = parsed.trigger_config;
  settings.condition_generation = conditionGenerationConfig;

  if (settings.voice_enabled) {
    stimBank.convert_to_voice("instruction_text", {
      voice: String(settings.voice_name ?? "en-US-AriaNeural"),
      rate: 1,
      assetFiles: {}
    });
  }

  await mountTaskApp({
    root,
    task_id: "H000033-visual-search",
    task_name: "Visual Search Task",
    task_description:
      "HTML preview aligned to local psyflow Visual Search procedure and parameters.",
    settings,
    subInfo,
    stimBank,
    buildTrials: (): CompiledTrial[] => {
      reset_trial_counter();

      const compiledTrials: CompiledTrial[] = [];
      const totalBlocks = Math.max(1, Number(settings.total_blocks ?? 1));
      const trialPerBlock = resolveTrialPerBlock(settings);
      const conditionWeights = settings.resolve_condition_weights();

      const instructionInputs: Array<Resolvable<StimRef | StimSpec | null>> = [
        stimBank.get("instruction_text")
      ];
      if (settings.voice_enabled) {
        instructionInputs.push(stimBank.get("instruction_text_voice"));
      }
      compiledTrials.push(
        buildWaitTrial(
          { trial_id: "instruction", condition: "instruction", trial_index: -1 },
          null,
          "instruction_text",
          instructionInputs
        )
      );

      for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
        const blockId = `block_${blockIndex}`;
        const blockSeed = resolveBlockSeed(settings, blockIndex);

        const block = new BlockUnit({
          block_id: blockId,
          block_idx: blockIndex,
          settings,
          n_trials: trialPerBlock
        }).generate_conditions({
          weights: conditionWeights
        });

        compiledTrials.push(
          ...count_down({
            seconds: 3,
            block_id: blockId,
            trial_id_prefix: `countdown_${blockId}`,
            stim: { color: "white", height: 3.5 }
          })
        );

        for (let trialIndex = 0; trialIndex < block.conditions.length; trialIndex += 1) {
          const condition = normalizeConditionLabel(String(block.conditions[trialIndex]));
          const trial = new TrialBuilder({
            trial_id: next_trial_id(),
            block_id: blockId,
            trial_index: trialIndex,
            condition
          });
          run_trial(trial, condition, {
            settings,
            stimBank,
            block_id: blockId,
            block_idx: blockIndex,
            block_seed: blockSeed,
            condition_generation: conditionGenerationConfig
          });
          compiledTrials.push(trial.build());
        }

        if (blockIndex < totalBlocks - 1) {
          compiledTrials.push(
            buildWaitTrial(
              {
                trial_id: `block_break_${blockIndex}`,
                condition: "block_break",
                trial_index: trialPerBlock + blockIndex
              },
              blockId,
              "block_break",
              [
                (_snapshot: TrialSnapshot, runtime: RuntimeView) => {
                  const summary = summarizeBlock(runtime.getReducedRows(), blockId);
                  return stimBank.get_and_format("block_break", {
                    block_num: blockIndex + 1,
                    total_blocks: totalBlocks,
                    block_accuracy_pct: summary.accuracy_pct,
                    mean_rt_ms: summary.mean_rt_ms,
                    timeout_count: summary.timeout_count
                  });
                }
              ]
            )
          );
        }
      }

      compiledTrials.push(
        buildWaitTrial(
          {
            trial_id: "goodbye",
            condition: "goodbye",
            trial_index: Number(settings.total_trials ?? 0)
          },
          null,
          "goodbye",
          [
            (_snapshot: TrialSnapshot, runtime: RuntimeView) => {
              const summary = summarizeOverall(runtime.getReducedRows());
              return stimBank.get_and_format("good_bye", {
                total_trials: summary.total_trials,
                total_accuracy_pct: summary.accuracy_pct,
                mean_rt_ms: summary.mean_rt_ms,
                total_timeouts: summary.timeout_count
              });
            }
          ]
        )
      );

      return compiledTrials;
    }
  });
}

export async function main(root: HTMLElement): Promise<void> {
  await run(root);
}

export default main;
