"use client";

import { useActionState, useState } from "react";

import { saveApplicationAction, type ApplicationActionState } from "./application.actions";
import { ConsentForm } from "./consent-form";
import type { ConsentLocale } from "./consent.model";
import { ProfilePhotoField } from "./profile-photo-field";

const initialState: ApplicationActionState = { status: "idle" };
const inputClass = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2";

export function ApplicationForm() {
  const [state, action, pending] = useActionState(saveApplicationAction, initialState);
  const [locale, setLocale] = useState<ConsentLocale>("en");

  return (
    <form action={action} className="space-y-6">
      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Identity declaration</legend>
        <label className="sm:col-span-2">
          <span className="text-sm font-medium">Full legal name</span>
          <input className={inputClass} name="legalName" autoComplete="name" maxLength={120} required />
        </label>
        <label>
          <span className="text-sm font-medium">Date of birth</span>
          <input className={inputClass} name="dateOfBirth" type="date" required />
        </label>
        <div className="space-y-3 pt-6 text-sm">
          <label className="flex items-start gap-2">
            <input className="mt-1" name="legalNameDeclared" type="checkbox" required />
            <span>I declare this is my full legal name.</span>
          </label>
          <label className="flex items-start gap-2">
            <input className="mt-1" name="age18Declared" type="checkbox" required />
            <span>I declare that I am at least 18 years old.</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Home area and public profile</legend>
        <label><span className="text-sm font-medium">City</span><input className={inputClass} name="homeCity" maxLength={100} required /></label>
        <label><span className="text-sm font-medium">District</span><input className={inputClass} name="homeDistrict" maxLength={100} required /></label>
        <label className="sm:col-span-2"><span className="text-sm font-medium">State</span><input className={inputClass} name="homeState" maxLength={100} required /></label>
        <label className="sm:col-span-2"><span className="text-sm font-medium">Short biography</span><textarea className={inputClass} name="bio" maxLength={500} rows={4} /></label>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Reporting beats</p>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {["Civic", "Crime", "Education", "Environment", "Health", "Business", "Culture", "Sports"].map((beat) => (
              <label className="flex gap-2" key={beat}>
                <input name="beats" type="checkbox" value={beat.toLocaleLowerCase("en")} /> {beat}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <ProfilePhotoField />
      <ConsentForm locale={locale} onLocaleChange={setLocale} />

      {state.message ? (
        <p aria-live="polite" className={state.status === "error" ? "text-sm text-red-700" : "text-sm text-green-700"}>
          {state.message}
        </p>
      ) : null}
      <button className="w-full rounded-md bg-foreground px-4 py-3 font-medium text-background disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Saving…" : "Save application"}
      </button>
    </form>
  );
}
