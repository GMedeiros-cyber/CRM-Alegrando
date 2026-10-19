import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlaceholders, mensagemPosPasseio, SETTING_DEFAULTS } from "./settings_helper";

test("troca chave dupla, a convenção dos textos antigos", () => {
    assert.equal(applyPlaceholders("Olá {{nome}}!", { nome: "Ana" }), "Olá Ana!");
    assert.equal(
        applyPlaceholders("Avalie: {{link_google}}", { link_google: "https://g.page/x" }),
        "Avalie: https://g.page/x",
    );
});

test("troca chave simples, a convenção dos textos novos", () => {
    assert.equal(applyPlaceholders("Olá {nome}!", { nome: "Ana" }), "Olá Ana!");
    assert.equal(applyPlaceholders("Fotos: {link}", { link: "https://x" }), "Fotos: https://x");
});

test("`link` e `link_google` apontam para o mesmo valor", () => {
    assert.equal(applyPlaceholders("{link}", { link_google: "https://g" }), "https://g");
    assert.equal(applyPlaceholders("{{link_google}}", { link: "https://g" }), "https://g");
});

test("troca TODAS as ocorrências, não só a primeira", () => {
    assert.equal(applyPlaceholders("{nome} e {nome}", { nome: "Ana" }), "Ana e Ana");
    assert.equal(applyPlaceholders("{{nome}} e {nome}", { nome: "Ana" }), "Ana e Ana");
});

test("placeholder desconhecido fica literal, não vira vazio", () => {
    assert.equal(applyPlaceholders("Olá {sobrenome}!", { nome: "Ana" }), "Olá {sobrenome}!");
    assert.equal(applyPlaceholders("{{atendente}}", { nome: "Ana" }), "{{atendente}}");
});

test("sem valor para a chave, o texto nao e mutilado", () => {
    assert.equal(applyPlaceholders("Olá {nome}!", {}), "Olá {nome}!");
    assert.equal(applyPlaceholders("Olá {nome}!", { nome: "" }), "Olá {nome}!");
});

test("os textos guardados hoje ficam todos substituidos", () => {
    // O ponto do conserto: os quatro defaults do projeto usam convenções
    // diferentes e nenhum pode sobrar com placeholder literal.
    const vars = { nome: "Ana", link_google: "https://g.page/x" };
    for (const [chave, texto] of Object.entries(SETTING_DEFAULTS)) {
        if (chave === "categorias_passeio") continue;
        const saida = applyPlaceholders(texto, vars);
        assert.ok(!/\{\{?\s*(nome|link|link_google)\s*\}?\}/i.test(saida), `${chave} sobrou com placeholder`);
    }
});

// ===== Pós-passeio pelo applyPlaceholders (19/10/2026) =====

/** A substituição que sendPosPasseio fazia até aqui, copiada como referência. */
const posPasseioAntigo = (template: string, nome: string, link: string) =>
    template.replace("{nome}", nome).replace("{link}", link);

test("pós-passeio: o texto enviado não muda para o texto padrão", () => {
    const t = SETTING_DEFAULTS.pos_passeio_mensagem;
    const link = "https://drive.google.com/drive/folders/abc";
    assert.equal(mensagemPosPasseio(t, "Escola Monte Verde", link), posPasseioAntigo(t, "Escola Monte Verde", link));
});

test("pós-passeio: o texto enviado não muda para o texto salvo hoje (URL entre chaves, sem {link})", () => {
    // Mesmo formato do crm_settings em 19/10/2026, com a URL trocada por uma inventada.
    const t = "Olá {nome}! 😊 \nGostaria de agradecer pela confiança.\nDeixe uma avaliação, o link está aqui: {https://forms.gle/EXEMPLO}";
    const link = "https://drive.google.com/drive/folders/abc";
    assert.equal(mensagemPosPasseio(t, "Escola Monte Verde", link), posPasseioAntigo(t, "Escola Monte Verde", link));
});

test("pós-passeio: lead sem nome não gera mensagem (antes saía 'Olá !')", () => {
    assert.equal(mensagemPosPasseio("Olá {nome}!", "", "https://x"), null);
    assert.equal(mensagemPosPasseio("Olá {nome}!", "   ", "https://x"), null);
});
