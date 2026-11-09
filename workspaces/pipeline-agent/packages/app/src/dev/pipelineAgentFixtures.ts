// Data for the dev shell's scripted agent. It plays one failed pipeline of the
// pedidos-api example: a discount is applied in the wrong order and its test
// fails. Nothing here is product code, and nothing here reaches a backend.

export const CAMINHO_ALVO =
  'src/main/java/br/com/exemplo/pedidos/DescontoService.java';
export const CAMINHO_TESTE =
  'src/test/java/br/com/exemplo/pedidos/DescontoServiceTest.java';

export const PIPELINE_FALHO_ID = 9001;
export const JOB_TESTE_ID = 5531;
export const SHA_FALHO = '3c9e0a7f5d1b2e8c4a6f0d9b7e5c3a1f8d2b4e6c';
export const TITULO_COMMIT = 'feat: desconto por faixa acumulado com cupom';

export const MR_IID = 3;
export const MR_TITULO = 'fix: cupom e faixa somam sobre o valor bruto';
export const MR_URL =
  'https://gitlab.com/veecode-demos/pedidos-api/-/merge_requests/3';
export const PIPELINE_MR_ID = 9102;
export const PIPELINE_MR_URL =
  'https://gitlab.com/veecode-demos/pedidos-api/-/pipelines/9102';

export const CAUSA_DIAGNOSTICO =
  'Causa: DescontoService.calcularTotal calcula a faixa sobre o valor já descontado pelo cupom (comCupom). Evidência: expected 900,00 mas foi 902,50 no teste faixaECupomSomamSobreOValorBruto. A mudança soma o percentual de faixa e o de cupom e aplica sobre o valor bruto.';

export const TRACE_TESTE = `[ERROR] Tests run: 7, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.041 s <<< FAILURE! -- in br.com.exemplo.pedidos.DescontoServiceTest
[ERROR] br.com.exemplo.pedidos.DescontoServiceTest.faixaECupomSomamSobreOValorBruto -- Time elapsed: 0.017 s <<< FAILURE!
org.opentest4j.AssertionFailedError: faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00 ==> expected: <900.00> but was: <902.50>
	at org.junit.jupiter.api.AssertionFailureBuilder.build(AssertionFailureBuilder.java:151)
	at org.junit.jupiter.api.Assertions.assertEquals(Assertions.java:1156)
	at br.com.exemplo.pedidos.DescontoServiceTest.faixaECupomSomamSobreOValorBruto(DescontoServiceTest.java:40)
[INFO] Tests run: 11, Failures: 1, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE
`;

export const DIFF_COMMIT = `@@ -16,8 +16,8 @@ public class DescontoService {

     public BigDecimal calcularTotal(Pedido pedido) {
         BigDecimal bruto = pedido.valorBruto();
-        BigDecimal percentual = percentualFaixa(bruto).add(percentualCupom(pedido.cupom()));
-        return aplicarDesconto(bruto, percentual);
+        BigDecimal comCupom = aplicarDesconto(bruto, percentualCupom(pedido.cupom()));
+        return aplicarDesconto(comCupom, percentualFaixa(comCupom));
     }

     private BigDecimal percentualFaixa(BigDecimal valor) {
`;

export const SAIDA_MVN = `[INFO] Building pedidos-api 0.1.0-SNAPSHOT
[INFO] --- surefire:3.5.4:test (default-test) @ pedidos-api ---
[INFO] Running br.com.exemplo.pedidos.DescontoServiceTest
[ERROR] Tests run: 7, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.094 s <<< FAILURE! -- in br.com.exemplo.pedidos.DescontoServiceTest
[ERROR]   DescontoServiceTest.faixaECupomSomamSobreOValorBruto:40 faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00 ==> expected: <900.00> but was: <902.50>
[INFO] BUILD FAILURE
`;

export const TRECHO_TESTE = `    @Test
    void faixaECupomSomamSobreOValorBruto() {
        assertEquals(
                new BigDecimal("900.00"),
                servico.calcularTotal(pedido("1000.00", "VOLTA5")),
                "faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00");
    }
`;

export const DIFF_PROPOSTA = `--- a/src/main/java/br/com/exemplo/pedidos/DescontoService.java main
+++ b/src/main/java/br/com/exemplo/pedidos/DescontoService.java proposta
@@ -16,8 +16,8 @@

     public BigDecimal calcularTotal(Pedido pedido) {
         BigDecimal bruto = pedido.valorBruto();
-        BigDecimal comCupom = aplicarDesconto(bruto, percentualCupom(pedido.cupom()));
-        return aplicarDesconto(comCupom, percentualFaixa(comCupom));
+        BigDecimal percentual = percentualFaixa(bruto).add(percentualCupom(pedido.cupom()));
+        return aplicarDesconto(bruto, percentual);
     }

     private BigDecimal percentualFaixa(BigDecimal valor) {
`;

export const HISTORICO_INICIAL = [
  {
    titulo: 'Pipeline 8842 · job build · MR !2 aberto',
    diasAtras: 2,
    custoUsd: 0.19,
  },
  {
    titulo: 'Pipeline 8810 · job test · recusado',
    diasAtras: 1,
    custoUsd: 0.19,
  },
];
