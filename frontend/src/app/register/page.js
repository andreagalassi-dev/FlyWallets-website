"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import useAuthStore from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordStrength } from "@/components/ui/PasswordStrength";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/Card";
import { Loader2, Building2, User } from "lucide-react";
import { clsx } from "clsx";
import { Country, State } from "country-state-city";
import Logo from "@/components/brand/Logo";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userType, setUserType] = useState("individual"); // 'individual' or 'business'
  const [phonePrefix, setPhonePrefix] = useState("+39");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirm_password: "",
    first_name: "",
    last_name: "",
    fiscal_code: "",
    date_of_birth: "",
    place_of_birth: "",
    phone_number: "", // This will just be the number part in UI
    address_street: "",
    address_city: "",
    address_province: "",
    address_postal_code: "",
    address_country: "IT",
    // Business specific
    company_name: "",
    vat_number: "",
    owner_first_name: "",
    owner_last_name: "",
    owner_fiscal_code: "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (formData.password !== formData.confirm_password) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (!/^\d{5,}$/.test(formData.address_postal_code)) {
      setError("ZIP code must be at least 5 digits numbers");
      setLoading(false);
      return;
    }

    try {
      // Concatenate Phone Number
      const fullPhoneNumber = `${phonePrefix}${formData.phone_number}`;

      // Filter data based on userType
      const payload = {
        email: formData.email,
        password: formData.password,
        user_type: userType,
        phone_number: formData.phone_number
          ? fullPhoneNumber
          : userType === "business"
          ? fullPhoneNumber
          : "",
        address_street: formData.address_street,
        address_city: formData.address_city,
        address_province: formData.address_province,
        address_postal_code: formData.address_postal_code,
        address_country: formData.address_country,
      };

      if (userType === "individual") {
        payload.first_name = formData.first_name;
        payload.last_name = formData.last_name;
        payload.fiscal_code = formData.fiscal_code;
        payload.date_of_birth = formData.date_of_birth;
        payload.place_of_birth = formData.place_of_birth;
      } else {
        payload.company_name = formData.company_name;
        payload.vat_number = formData.vat_number;
        payload.owner_first_name = formData.owner_first_name;
        payload.owner_last_name = formData.owner_last_name;
        payload.owner_fiscal_code = formData.owner_fiscal_code;
      }

      // Remove phone_number from payload if empty and individual (optional)
      if (!formData.phone_number && userType === "individual") {
        delete payload.phone_number;
      }

      const res = await api.post("/auth/register", payload);

      if (res.status === 201) {
        login(res.data.data.user);
        router.push("/register/verify-email");
      }
    } catch (err) {
      console.error(err);
      const msg = getErrorMessage(err, "Registration failed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Prepare Countries for Phone Dropdown
  const phoneCountries = Country.getAllCountries();

  return (
    <div className="min-h-screen py-10 flex items-center justify-center">
      <div className="relative w-full max-w-2xl px-4">
        <div className="text-center mb-6">
          <div className="mb-4 flex justify-center">
            <Logo href="/" size={26} />
          </div>
          <h1 className="text-3xl font-bold text-primary">Join FlyWallets</h1>
          <p className="text-gray-400">
            Start your journey to financial excellence
          </p>
        </div>

        <Card>
          <CardHeader>
            {/* User Type Toggle */}
            <div className="grid grid-cols-2 gap-4 p-1 bg-black/30 rounded-lg mb-4">
              <button
                type="button"
                onClick={() => setUserType("individual")}
                className={clsx(
                  "flex items-center justify-center gap-2 py-2 rounded-md transition-all font-medium text-sm",
                  userType === "individual"
                    ? "bg-primary text-black shadow-lg"
                    : "text-gray-400 hover:text-white"
                )}
              >
                <User size={16} /> Individual
              </button>
              <button
                type="button"
                onClick={() => setUserType("business")}
                className={clsx(
                  "flex items-center justify-center gap-2 py-2 rounded-md transition-all font-medium text-sm",
                  userType === "business"
                    ? "bg-primary text-black shadow-lg"
                    : "text-gray-400 hover:text-white"
                )}
              >
                <Building2 size={16} /> Business
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-md">
                  {error}
                </div>
              )}

              {/* Email - Always First */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-300">
                  Email
                </label>
                <Input
                  name="email"
                  type="email"
                  placeholder="name@example.com"
                  onChange={handleChange}
                  required
                />
              </div>

              {/* Individual Fields */}
              {userType === "individual" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-300">
                        First Name
                      </label>
                      <Input
                        name="first_name"
                        placeholder="Mario"
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-300">
                        Last Name
                      </label>
                      <Input
                        name="last_name"
                        placeholder="Rossi"
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      Fiscal Code
                    </label>
                    <Input
                      name="fiscal_code"
                      placeholder="RSSMRA80A01H501U"
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-300">
                        Date of Birth
                      </label>
                      <Input
                        name="date_of_birth"
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-300">
                        Place of Birth
                      </label>
                      <Input
                        name="place_of_birth"
                        placeholder="Roma"
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Business Fields */}
              {userType === "business" && (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      Company Name
                    </label>
                    <Input
                      name="company_name"
                      placeholder="FlyWallets Ltd."
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      VAT Number
                    </label>
                    <Input
                      name="vat_number"
                      placeholder="IT12345678901"
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="border-t border-white/10 my-4 pt-4">
                    <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                      Legal Representative
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-300">
                          Owner First Name
                        </label>
                        <Input
                          name="owner_first_name"
                          placeholder="Mario"
                          onChange={handleChange}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-gray-300">
                          Owner Last Name
                        </label>
                        <Input
                          name="owner_last_name"
                          placeholder="Rossi"
                          onChange={handleChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2 mt-4">
                      <label className="text-xs font-medium text-gray-300">
                        Owner Fiscal Code
                      </label>
                      <Input
                        name="owner_fiscal_code"
                        placeholder="RSSMRA..."
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="border-t border-white/10 my-4 pt-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                  Address Details
                </p>
                {/* 1. Country & Province */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      Country
                    </label>
                    <div className="relative">
                      <select
                        name="address_country"
                        value={formData.address_country}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            address_country: e.target.value,
                            address_province: "", // Reset province when country changes
                          });
                        }}
                        className="w-full h-10 px-3 bg-black/40 border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                        required
                      >
                        <option value="" disabled>
                          Select Country
                        </option>
                        {Country.getAllCountries().map((country) => (
                          <option key={country.isoCode} value={country.isoCode}>
                            {country.flag} {country.name}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                        <svg
                          className="fill-current h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      State / Province / Region
                    </label>
                    <div className="relative">
                      <select
                        name="address_province"
                        value={formData.address_province}
                        onChange={handleChange}
                        className="w-full h-10 px-3 bg-black/40 border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none disabled:opacity-50"
                        required
                        disabled={!formData.address_country}
                      >
                        <option value="" disabled>
                          Select State/Province
                        </option>
                        {formData.address_country &&
                          State.getStatesOfCountry(
                            formData.address_country
                          ).map((state) => (
                            <option key={state.isoCode} value={state.isoCode}>
                              {state.name}
                            </option>
                          ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                        <svg
                          className="fill-current h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Street (Full Width) */}
                <div className="w-full mb-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      Street
                    </label>
                    <Input
                      name="address_street"
                      placeholder="Via Roma 1"
                      onChange={handleChange}
                      required
                      className="w-full"
                    />
                  </div>
                </div>

                {/* 3. City & Zip */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      City
                    </label>
                    <Input
                      name="address_city"
                      placeholder="Milano"
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      ZIP Code
                    </label>
                    <Input
                      name="address_postal_code"
                      placeholder="20100"
                      onChange={handleChange}
                      required
                      inputMode="numeric"
                      pattern="\d{5,}"
                      title="ZIP Code must be at least 5 digits"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-300">
                  Phone{" "}
                  {userType === "individual" ? "(Optional)" : "(Required)"}
                </label>
                <div className="flex gap-2">
                  {/* Prefix Dropdown */}
                  <div className="relative w-1/3 min-w-[120px]">
                    <select
                      name="phone_prefix"
                      value={phonePrefix}
                      onChange={(e) => setPhonePrefix(e.target.value)}
                      className="w-full h-10 pl-2 pr-6 bg-black/40 border border-white/10 rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary appearance-none truncate"
                    >
                      {phoneCountries.map((c) => (
                        <option key={c.isoCode} value={`+${c.phonecode}`}>
                          {c.flag} +{c.phonecode}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                      <svg
                        className="fill-current h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>

                  {/* Number Input */}
                  <Input
                    name="phone_number"
                    placeholder="333 1234567"
                    onChange={handleChange}
                    required={userType === "business"}
                    className="flex-1"
                    type="tel"
                  />
                </div>
              </div>

              <div className="border-t border-white/10 my-4 pt-4">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                  Security
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      Password
                    </label>
                    <Input
                      name="password"
                      type="password"
                      placeholder="Min 8 chars, 1 Upper, 1 Special"
                      onChange={handleChange}
                      required
                    />
                    <PasswordStrength password={formData.password} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-300">
                      Confirm Password
                    </label>
                    <Input
                      name="confirm_password"
                      type="password"
                      placeholder="Re-enter password"
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full mt-4" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Create Account"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-gray-400">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Log In
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
