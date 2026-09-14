import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");

describe("Login sequencial do AgroRisk", () => {
  test("oculta credenciais até a seleção de um perfil", () => {
    expect(source).toContain("const [selected, setSelected] = useState<ProfileId | null>(null)");
    expect(source).toContain("{selected && (");
    expect(source).toContain('aria-labelledby="credentials-heading"');
    expect(source).toContain("Selecione seu perfil");
    expect(source).toContain("Confirme suas credenciais");
  });

  test("preserva autenticação, erro e redirecionamento por persona", () => {
    expect(source).toContain("login(selected, email, password)");
    expect(source).toContain("navigate({ to: defaultRouteFor(selected) })");
    expect(source).toContain('role="alert"');
    expect(source).toContain('type="submit"');
  });

  test("mantém troca acessível, foco no e-mail e layout responsivo", () => {
    expect(source).toContain("aria-pressed={active}");
    expect(source).toContain("emailRef.current?.focus()");
    expect(source).toContain("ref={emailRef}");
    expect(source).toContain("sm:grid-cols-2");
  });
});