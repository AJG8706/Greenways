import { describe, expect, it } from "vitest";
import {
  authCookieOptions,
  REMEMBER_MAX_AGE_S,
  rememberedFrom,
} from "@/lib/supabase/cookies";

describe("remember-this-device cookie logic", () => {
  it("defaults to remembered when the preference cookie is missing", () => {
    // Cross-browser magic links and pre-existing sessions carry no cookie.
    expect(rememberedFrom(undefined)).toBe(true);
    expect(rememberedFrom("1")).toBe(true);
    expect(rememberedFrom("0")).toBe(false);
  });

  it("remembered: pins auth cookies to the 30-day rolling window", () => {
    const out = authCookieOptions(true, {
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
      expires: new Date("2030-01-01"),
    });
    expect(out.maxAge).toBe(REMEMBER_MAX_AGE_S);
    expect(out.maxAge).toBe(30 * 24 * 60 * 60);
    expect(out.expires).toBeUndefined();
    expect(out.path).toBe("/");
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
