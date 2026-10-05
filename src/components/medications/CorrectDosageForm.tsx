import { Save } from "lucide-react";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useSubmitting } from "@/components/hooks/useSubmitting";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEDICATION_COPY } from "@/lib/copy/medications";
import type { RegistryVariantOption } from "@/types";

const copy = MEDICATION_COPY.correction;
const addCopy = MEDICATION_COPY.add;
const formCopy = MEDICATION_COPY.form;

interface Props {
  // Validated uuids of the medication and the period: part of the form action, never anything typed.
  medicationId: string;
  periodId: string;
  // Dose saved in the period, prefilled so a typo is fixed in place. Travels only in the form body.
  savedDose: string;
  // Variants of the same product with the same composition; empty for a leaflet medication (no variant field).
  variants: RegistryVariantOption[];
  // Variant saved in the period, checked by default.
  savedVariantId: string | null;
  serverError?: string | null;
}

// Native POST form on the pattern of ChangeDosageForm: fields and radios work without JavaScript. React only disables
// the button after the first submit, so a double click cannot send the same correction twice.
export default function CorrectDosageForm({
  medicationId,
  periodId,
  savedDose,
  variants,
  savedVariantId,
  serverError,
}: Props) {
  const [submitting, markSubmitting] = useSubmitting();

  return (
    <Card>
      <CardContent>
        <form
          method="POST"
          action={`/api/medications/${medicationId}/periods/${periodId}`}
          className="flex flex-col gap-6"
          onSubmit={markSubmitting}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="doseText">
              {copy.doseLabel} <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
            </Label>
            <Input
              id="doseText"
              name="doseText"
              defaultValue={savedDose}
              maxLength={200}
              required
              autoComplete="off"
              aria-describedby="doseText-hint"
            />
            <p id="doseText-hint" className="text-muted-foreground text-sm">
              {addCopy.doseHint}
            </p>
          </div>

          {variants.length > 0 && (
            <fieldset className="flex flex-col gap-3" aria-describedby="registryProductId-hint">
              <legend className="mb-3 text-lg font-semibold">
                {MEDICATION_COPY.dosageChange.variantLegend}{" "}
                <span className="text-muted-foreground font-normal">{formCopy.requiredMark}</span>
              </legend>
              <p id="registryProductId-hint" className="text-muted-foreground text-sm">
                {copy.variantHint}
              </p>
              {variants.map((variant) => (
                <label
                  key={variant.id}
                  className="border-border has-[:checked]:border-primary has-[:checked]:ring-primary flex cursor-pointer items-start gap-3 rounded-lg border p-4 has-[:checked]:ring-2"
                >
                  <input
                    type="radio"
                    name="registryProductId"
                    value={variant.id}
                    defaultChecked={variant.id === savedVariantId}
                    required
                    className="accent-primary mt-1 size-5 shrink-0"
                  />
                  <span className="flex flex-col gap-1">
                    <span>
                      {addCopy.strength}: {variant.strength ?? "—"} · {addCopy.form}: {variant.form ?? "—"}
                      {variant.id === savedVariantId && (
                        <span className="text-muted-foreground"> {copy.savedVariantMark}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {addCopy.composition}:{" "}
                      {variant.composition.length > 0 ? variant.composition.join(", ") : addCopy.compositionUnknown}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <ServerError message={serverError} />

          <SubmitButton pending={submitting} pendingText={addCopy.pending} icon={<Save className="size-4" />}>
            {copy.submit}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
