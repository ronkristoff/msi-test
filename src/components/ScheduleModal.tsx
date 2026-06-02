"use client";

import { useEffect } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/FormField";
import { scheduleSchema, CADENCE_PRESETS, type ScheduleValues } from "@/lib/schemas";

type SuiteItem = { _id: string; name: string; project_id: string };
type EnvItem = { _id: string; name: string };

type ScheduleData = {
  _id: string;
  name: string;
  suite_id: string;
  environment_id: string;
  cadence: { seconds: number };
};

type ScheduleModalProps = {
  schedule?: ScheduleData;
  onClose: () => void;
};

export function ScheduleModal({ schedule, onClose }: ScheduleModalProps) {
  const createSchedule = useMutation(api.schedules.mutations.createSchedule);
  const updateSchedule = useMutation(api.schedules.mutations.updateSchedule);

  const suitesData = useQuery(api.suites.queries.getSuitesForWorkspace);
  const suites: SuiteItem[] = suitesData ?? [];

  const methods = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: schedule
      ? {
          name: schedule.name,
          suite_id: schedule.suite_id,
          environment_id: schedule.environment_id,
          cadence_seconds: schedule.cadence.seconds,
        }
      : {
          name: "",
          suite_id: "",
          environment_id: "",
          cadence_seconds: 86400,
        },
  });

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = methods;
  const suiteId = watch("suite_id");

  const selectedSuite = suites.find((s) => s._id === suiteId);
  const envsData = useQuery(
    api.environments.queries.getEnvironments,
    selectedSuite ? { project_id: selectedSuite.project_id as Id<"projects"> } : "skip",
  );
  const envs: EnvItem[] = envsData ?? [];

  useEffect(() => {
    if (!schedule && suites.length > 0) {
      setValue("suite_id", suites[0]._id);
    }
  }, [suites, schedule, setValue]);

  useEffect(() => {
    if (!schedule && envs.length > 0) {
      setValue("environment_id", envs[0]._id);
    }
  }, [envs, schedule, setValue]);

  const isEdit = !!schedule;

  const onSubmit = async (data: ScheduleValues) => {
    if (isEdit) {
      await updateSchedule({
        schedule_id: schedule._id as Id<"schedules">,
        name: data.name,
        cadence_seconds: data.cadence_seconds,
        environment_id: data.environment_id as Id<"environments">,
      });
    } else {
      await createSchedule({
        name: data.name,
        suite_id: data.suite_id as Id<"suites">,
        environment_id: data.environment_id as Id<"environments">,
        cadence_seconds: data.cadence_seconds,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-lg w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">
          {isEdit ? "Edit Schedule" : "Create Schedule"}
        </h2>

        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Name"
              required
              error={errors.name?.message}
              placeholder="e.g. Daily regression"
              {...register("name")}
            />

            {!isEdit && (
              <Select
                label="Suite"
                error={errors.suite_id?.message}
                {...register("suite_id")}
              >
                <option value="">Select a suite</option>
                {suites.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}

            <Select
              label="Environment"
              error={errors.environment_id?.message}
              {...register("environment_id")}
            >
              <option value="">Select environment</option>
              {envs.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.name}
                </option>
              ))}
            </Select>

            <Select
              label="Cadence"
              error={errors.cadence_seconds?.message}
              {...register("cadence_seconds", { valueAsNumber: true })}
            >
              {CADENCE_PRESETS.map((p) => (
                <option key={p.seconds} value={p.seconds}>
                  {p.label}
                </option>
              ))}
            </Select>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isEdit ? "Save Changes" : "Create"}
              </Button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
