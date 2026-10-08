import { describe, expect, it } from "vitest";
import { authCookieOptions, rememberedFrom } from "@/lib/supabase/cookies";

describe("remember-this-device cookie logic", () => {
  it("defaults to remembered when the preference cookie is missing", () => {
    // Cross-browser magic links and pre-existing sessions carry no cookie.
    expect(rememberedFrom(undefined)).toBe(true);
    expect(rememberedFrom("1")).toBe(true);
    expect(rememberedFrom("0")).toBe(false);
  });

  it("remembered: keeps the auth library's long-lived defaults untouched", () => {
    const options = {
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
      expires: new Date("2030-01-01"),
    };
    expect(authCookieOptions(true, options)).toEqual(options);
  });

  it("not remembered: strips lifetimes so cookies end with the browser session", () => {
    const out = authCookieOptions(false, {
      path: "/",
      httpOnly: true,
      maxAge: 400 * 24 * 60 * 60,
      expires: new Date("2030-01-01"),
    });
    expect("maxAge" in out).toBe(false);
    expect("expires" in out).toBe(false);
    expect(out.httpOnly).toBe(true);
    expect(out.path).toBe("/");
  });
});
