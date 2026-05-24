"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Alert";
import { useErrorLogger } from "@/lib/error-logger";
import { loginFormSchema, signupSchema, type SignupValues } from "@/lib/schemas";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { logError } = useErrorLogger();

  const { data: session } = useSession();
  const isLoggedIn = !!session;

  useEffect(() => {
    if (isLoggedIn) {
      router.push("/dashboard");
    }
  }, [isLoggedIn, router]);

  const { register, handleSubmit, formState: { errors } } = useForm<SignupValues>({
    resolver: zodResolver(isSignUp ? signupSchema : loginFormSchema),
    defaultValues: { email: "", password: "", firstName: "", lastName: "" },
  });

  const onSubmit = async (data: SignupValues) => {
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const name = `${data.firstName} ${data.lastName}`.trim();
        const result = await authClient.signUp.email({
          email: data.email,
          password: data.password,
          name,
        });
        if (result.error) {
          const msg = result.error.message ?? "Sign up failed";
          setError(msg);
          logError(msg, { context: { action: "signup", email: data.email } });
          return;
        }
      } else {
        const result = await authClient.signIn.email({
          email: data.email,
          password: data.password,
        });
        if (result.error) {
          const msg = result.error.message ?? "Sign in failed";
          setError(msg);
          logError(msg, { context: { action: "signin", email: data.email } });
          return;
        }
      }
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
      logError(msg, {
        stack: err instanceof Error ? err.stack : undefined,
        context: { action: isSignUp ? "signup" : "signin" },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 font-[var(--font-display)] text-[22px] font-black tracking-[-0.01em] mb-3">
            <Logo />
            MSITest
          </div>
          <p className="font-[var(--font-mono)] text-xs text-[var(--muted)] tracking-wider">
            AI-powered E2E test intelligence
          </p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] p-8 shadow-[var(--elev-raised)]">
          <h1 className="font-[var(--font-display)] text-2xl font-normal text-[var(--fg)] mb-1">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-[var(--muted)] mb-6">
            {isSignUp ? "Get started with MSITest" : "Sign in to your workspace"}
          </p>

          {error && (
            <Alert variant="error" className="mb-4">{error}</Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)}>
            {isSignUp && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="First name"
                  placeholder="Alex"
                  autoComplete="given-name"
                  error={errors.firstName?.message}
                  {...register("firstName")}
                />
                <Input
                  label="Last name"
                  placeholder="Rivera"
                  autoComplete="family-name"
                  error={errors.lastName?.message}
                  {...register("lastName")}
                />
              </div>
            )}

            <Input
              label="Work email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              spellCheck={false}
              error={errors.email?.message}
              {...register("email")}
            />

            <Input
              label="Password"
              type="password"
              togglePassword
              placeholder="••••••••"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              error={errors.password?.message}
              {...register("password")}
            />

            <Button type="submit" disabled={loading} className="w-full py-[13px] px-6 text-base font-medium mt-2">
              {loading
                ? (isSignUp ? "Creating account..." : "Signing in...")
                : (isSignUp ? "Create account" : "Sign in")}
            </Button>
          </form>

          <div className="flex items-center gap-4 my-6 text-sm text-[var(--muted)]">
            <div className="flex-1 h-px bg-[var(--border)]" />
            or
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={handleGoogle}
            className="w-full py-[13px] px-6 text-base"
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
              </svg>
            }
          >
            Continue with Google
          </Button>
        </div>

        <p className="text-center mt-6 text-sm text-[var(--muted)]">
          {isSignUp ? "Already have an account?" : "No account?"}{" "}
          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            className="text-[var(--accent)] font-medium hover:text-[var(--accent-hover)]"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </p>

        <footer className="text-center mt-8 font-[var(--font-mono)] text-xs text-[var(--muted)] flex items-center justify-center gap-4">
          <span>&copy; {new Date().getFullYear()} MSITest Inc.</span>
        </footer>
      </div>
    </div>
  );
}
