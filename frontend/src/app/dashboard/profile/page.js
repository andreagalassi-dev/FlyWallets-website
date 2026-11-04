"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, BadgeCheck, MailWarning, Lock } from "lucide-react";
import { Country, State } from "country-state-city";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import useAuthStore from "@/store/authStore";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";

const MAX_LENGTH = 255;

// Fields the backend accepts on PUT /auth/profile (fiscal_code and vat_number are identity fields: never sent)
const COMMON_FIELDS = [
  "phone_number",
  "address_street",
  "address_city",
  "address_postal_code",
  "address_province",
  "address_country",
];
const EDITABLE_FIELDS = {
  individual: ["first_name", "last_name", "date_of_birth", "place_of_birth", "nationality", ...COMMON_FIELDS],
  business: ["company_name", "owner_first_name", "owner_last_name", "owner_fiscal_code", ...COMMON_FIELDS],
};

const LABELS = {
  first_name: "First name",
  last_name: "Last name",
  date_of_birth: "Date of birth",
  place_of_birth: "Place of birth",
  nationality: "Nationality",
  company_name: "Company name",
  owner_first_name: "First name",
  owner_last_name: "Last name",
  owner_fiscal_code: "Fiscal code",
  phone_number: "Phone",
  address_street: "Street address",
  address_city: "City",
  address_postal_code: "ZIP code",
  address_province: "State / province",
  address_country: "Country",
};

const getType = (user) => (user?.user_type?.toLowerCase() === "business" ? "business" : "individual");

// Date-only values are kept as "YYYY-MM-DD" (no Date parsing, so no timezone shifts)
const toDateInput = (value) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "");

function toForm(user) {
  const form = {};
  for (const name of EDITABLE_FIELDS[getType(user)]) {
    form[name] = name === "date_of_birth" ? toDateInput(user?.[name]) : user?.[name] ?? "";
  }
  return form;
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
        {label} <Lock size={11} aria-hidden="true" />
      </label>
      <Input value={value || "—"} disabled readOnly className="bg-white/5 border-transparent" />
      <p className="text-xs text-gray-500">Identity details can&apos;t be changed.</p>
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-medium text-primary border-b border-white/10 pb-2">{title}</h3>
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [edits, setEdits] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Refresh the stored user (e.g. e-mail verification status may have changed elsewhere)
  useEffect(() => {
    let cancelled = false;
    api
      .get("/auth/me")
      .then((res) => {
        const fresh = res.data?.data?.user ?? res.data?.data;
        if (!cancelled && fresh && typeof fresh === "object") updateUser(fresh);
      })
      .catch(() => {}); // the stored user is still good enough to render
    return () => {
      cancelled = true;
    };
  }, [updateUser]);

  const type = getType(user);
  const baseline = useMemo(() => (user ? toForm(user) : {}), [user]);

  if (!user) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto" aria-busy="true" aria-label="Loading profile">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const value = (name) => edits[name] ?? baseline[name] ?? "";
  const changed = Object.keys(edits).filter((name) => edits[name] !== baseline[name]);
  const dirty = changed.length > 0;

  const set = (name) => (e) => {
    const next = e.target.value;
    setEdits((prev) => ({ ...prev, [name]: next }));
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  const setCountry = (e) => {
    // A province from another country would be inconsistent: reset it
    setEdits((prev) => ({ ...prev, address_country: e.target.value, address_province: "" }));
    setFieldErrors((prev) => ({ ...prev, address_country: undefined, address_province: undefined }));
  };

  const validate = () => {
    const errors = {};
    for (const name of changed) {
      const v = edits[name].trim();
      if (!v) errors[name] = baseline[name] ? "Can't be left empty" : undefined;
      else if (v.length > MAX_LENGTH) errors[name] = `Max ${MAX_LENGTH} characters`;
      else if (name === "date_of_birth" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[name] = "Enter a valid date";
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dirty) return;

    const errors = validate();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      toast.error("Please fix the highlighted fields");
      return;
    }

    // Only changed, non-empty fields are sent
    const payload = {};
    for (const name of changed) {
      const v = edits[name].trim();
      if (v) payload[name] = v;
    }
    if (!Object.keys(payload).length) {
      setEdits({});
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const res = await api.put("/auth/profile", payload);
      const updated = res.data?.data?.user;
      if (updated) updateUser(updated);
      else updateUser(payload);
      setEdits({});
      toast.success("Profile updated");
    } catch (err) {
      const list = err.response?.data?.errors;
      if (err.response?.status === 400 && Array.isArray(list) && list.length) {
        const mapped = {};
        const unmatched = [];
        for (const item of list) {
          const key = item.path ?? item.param;
          if (key && key in baseline) mapped[key] ??= item.msg;
          else unmatched.push(item.msg);
        }
        setFieldErrors(mapped);
        toast.error(unmatched[0] ?? "Please fix the highlighted fields");
      } else {
        toast.error(getErrorMessage(err, "Could not update your profile"));
      }
    } finally {
      setSaving(false);
    }
  };

  const text = (name, extra = {}) => (
    <div className="space-y-1.5">
      <label htmlFor={`f-${name}`} className="text-xs font-medium text-gray-300">
        {extra.label ?? LABELS[name]}
      </label>
      <Input
        id={`f-${name}`}
        name={name}
        value={value(name)}
        onChange={set(name)}
        maxLength={MAX_LENGTH}
        error={fieldErrors[name]}
        {...extra.props}
      />
    </div>
  );

  const countrySelect = (name, onChange = set(name)) => (
    <div className="space-y-1.5">
      <label htmlFor={`f-${name}`} className="text-xs font-medium text-gray-300">
        {LABELS[name]}
      </label>
      <Select id={`f-${name}`} name={name} value={value(name)} onChange={onChange}>
        <option value="">Select country</option>
        {Country.getAllCountries().map((c) => (
          <option key={c.isoCode} value={c.isoCode}>
            {c.name}
          </option>
        ))}
      </Select>
      {fieldErrors[name] && <p className="text-xs text-red-500">{fieldErrors[name]}</p>}
    </div>
  );

  const states = value("address_country") ? State.getStatesOfCountry(value("address_country")) : [];
  const verified = user.email_verified === true;
  const unverified = user.email_verified === false;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Profile</h1>
        <p className="text-gray-400">Your personal details and contact information.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Account</CardTitle>
          <CardDescription>Sign-in details and account type.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="f-email" className="text-xs font-medium text-gray-400">E-mail</label>
            <Input id="f-email" value={user.email || ""} disabled readOnly className="bg-white/5 border-transparent" />
            {verified && (
              <p className="flex items-center gap-1.5 text-xs text-green-400">
                <BadgeCheck size={14} /> E-mail verified
              </p>
            )}
            {unverified && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-primary">
                <MailWarning size={14} /> E-mail not verified.
                <Link href="/register/verify-email" className="underline underline-offset-2 hover:text-white">
                  Verify now
                </Link>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="f-type" className="text-xs font-medium text-gray-400">Account type</label>
            <Input id="f-type" value={type === "business" ? "Business" : "Individual"} disabled readOnly className="bg-white/5 border-transparent" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Personal information</CardTitle>
          <CardDescription>Only the fields you change are saved.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8" noValidate>
            {type === "individual" ? (
              <FormSection title="Identity">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {text("first_name")}
                  {text("last_name")}
                  <ReadOnlyField label="Fiscal code" value={user.fiscal_code} />
                  {countrySelect("nationality")}
                  {text("date_of_birth", { props: { type: "date", max: new Date().toISOString().slice(0, 10), maxLength: undefined } })}
                  {text("place_of_birth")}
                </div>
              </FormSection>
            ) : (
              <>
                <FormSection title="Company details">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {text("company_name")}
                    <ReadOnlyField label="VAT number" value={user.vat_number} />
                  </div>
                </FormSection>
                <FormSection title="Legal representative">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {text("owner_first_name")}
                    {text("owner_last_name")}
                    {text("owner_fiscal_code")}
                  </div>
                </FormSection>
              </>
            )}

            <FormSection title="Contact & address">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {text("phone_number", { props: { type: "tel" } })}
                {countrySelect("address_country", setCountry)}
              </div>
              {text("address_street")}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {text("address_city")}
                {states.length > 0 ? (
                  <div className="space-y-1.5">
                    <label htmlFor="f-address_province" className="text-xs font-medium text-gray-300">
                      {LABELS.address_province}
                    </label>
                    <Select id="f-address_province" name="address_province" value={value("address_province")} onChange={set("address_province")}>
                      <option value="">Select state</option>
                      {states.map((s) => (
                        <option key={s.isoCode} value={s.isoCode}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    {fieldErrors.address_province && <p className="text-xs text-red-500">{fieldErrors.address_province}</p>}
                  </div>
                ) : (
                  text("address_province")
                )}
                {text("address_postal_code")}
              </div>
            </FormSection>

            <div className="flex items-center justify-end gap-3">
              {dirty && (
                <Button type="button" variant="ghost" onClick={() => { setEdits({}); setFieldErrors({}); }} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button type="submit" disabled={saving || !dirty}>
                {saving && <Loader2 className="animate-spin mr-2" size={16} />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
