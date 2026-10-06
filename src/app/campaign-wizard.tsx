"use client";

import { useActionState, useState } from "react";
import { createCampaignAction } from "./actions";

type Draft = {
  name: string;
  originalPremise: string;
  description: string;
  setting: string;
  tone: string;
  originalNotes: string;
};

const emptyDraft: Draft = {
  name: "", originalPremise: "", description: "", setting: "", tone: "", originalNotes: "",
};

export function CampaignWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [stepError, setStepError] = useState("");
  const [result, formAction, pending] = useActionState(createCampaignAction, { message: "" });
  const change = (field: keyof Draft, value: string) => setDraft(previous => ({ ...previous, [field]: value }));
  const next = () => {
    if (step === 0 && (!draft.name.trim() || !draft.originalPremise.trim())) {
      setStepError("Enter a name and original premise to continue.");
      return;
    }
    setStepError("");
    setStep(current => Math.min(current + 1, 2));
  };

  return <form action={formAction}>
    <p role="status">Step {step + 1} of 3</p>
    {stepError && <p role="alert">{stepError}</p>}
    {result.message && <p role="alert">{result.message}</p>}
    {step === 0 && <section aria-labelledby="wizard-idea">
      <h3 id="wizard-idea">Start with your idea</h3>
      <p>These two fields preserve what you first imagined for the campaign.</p>
      <label htmlFor="wizard-name">Name</label>
      <input id="wizard-name" value={draft.name} onChange={event => change("name", event.target.value)} />
      <label htmlFor="wizard-premise">Original premise</label>
      <textarea id="wizard-premise" rows={5} value={draft.originalPremise} onChange={event => change("originalPremise", event.target.value)} />
    </section>}
    {step === 1 && <section aria-labelledby="wizard-context">
      <h3 id="wizard-context">Add context</h3>
      <p>All of these details are optional. You can change the setting and tone later.</p>
      <label htmlFor="wizard-description">Short description</label>
      <textarea id="wizard-description" rows={2} value={draft.description} onChange={event => change("description", event.target.value)} />
      <label htmlFor="wizard-setting">Setting</label>
      <input id="wizard-setting" value={draft.setting} onChange={event => change("setting", event.target.value)} />
      <label htmlFor="wizard-tone">Tone</label>
      <input id="wizard-tone" value={draft.tone} onChange={event => change("tone", event.target.value)} />
      <label htmlFor="wizard-notes">Original notes</label>
      <textarea id="wizard-notes" rows={4} value={draft.originalNotes} onChange={event => change("originalNotes", event.target.value)} />
    </section>}
    {step === 2 && <section aria-labelledby="wizard-review">
      <h3 id="wizard-review">Review your campaign</h3>
      <dl>
        <dt>Name</dt><dd>{draft.name}</dd>
        <dt>Original premise</dt><dd className="preserve-lines">{draft.originalPremise}</dd>
        {draft.description && <><dt>Short description</dt><dd>{draft.description}</dd></>}
        {draft.setting && <><dt>Setting</dt><dd>{draft.setting}</dd></>}
        {draft.tone && <><dt>Tone</dt><dd>{draft.tone}</dd></>}
        {draft.originalNotes && <><dt>Original notes</dt><dd className="preserve-lines">{draft.originalNotes}</dd></>}
      </dl>
      {(Object.keys(draft) as (keyof Draft)[]).map(field =>
        <input key={field} type="hidden" name={field} value={draft[field]} />)}
    </section>}
    <div className="actions">
      {step > 0 && <button type="button" disabled={pending} onClick={() => { setStepError(""); setStep(current => current - 1); }}>Back</button>}
      {step < 2 && <button type="button" onClick={next}>Continue</button>}
      {step === 2 && <button type="submit" disabled={pending}>Create campaign</button>}
    </div>
    {pending && <p role="status">Creating campaign…</p>}
  </form>;
}
