import { LoginForm } from "./form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold tracking-tight">
            ele<span className="text-brand">rent</span>
          </div>
          <p className="mt-2 text-sm text-ink-2">Monitoraggio città e affiliati</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
