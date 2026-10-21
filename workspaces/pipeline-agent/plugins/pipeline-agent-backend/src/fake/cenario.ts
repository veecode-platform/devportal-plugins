// Cenário do modo fake: o erro real do pedidos-api na branch main. O commit
// 6b2d2c79 calcula a faixa sobre o valor já descontado pelo cupom; o teste
// DescontoServiceTest.faixaECupomSomamSobreOValorBruto espera 900,00 e recebe
// 902,50. Os arquivos e as saídas abaixo são do repositório e do Maven de
// verdade (container maven:3.9-eclipse-temurin-21), não redigidos.
// O erro 2 (branch erro-2, PedidoController) não é roteirizado no fake.

export const CAMINHO_ALVO =
  'src/main/java/br/com/exemplo/pedidos/DescontoService.java';
export const CAMINHO_TESTE =
  'src/test/java/br/com/exemplo/pedidos/DescontoServiceTest.java';
export const REF_PIPELINE = 'main';

export const PIPELINE_FALHO_ID = 9001;
export const JOB_TEST_ID = 5531;
export const JOB_BUILD_ID = 5530;
export const SHA_COMMIT = '6b2d2c7990d83898ad7c9d2da115144592fb63ea';
export const TITULO_COMMIT = 'feat: desconto por faixa acumulado com cupom';
export const MR_FAKE_IID = 3;
export const PIPELINE_MR_ID = 9102;
export const NOME_TESTE = 'faixaECupomSomamSobreOValorBruto';

export const JAVA_ANTES = `package br.com.exemplo.pedidos;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class DescontoService {

    private static final BigDecimal ACIMA_DE_500 = new BigDecimal("500.00");
    private static final BigDecimal ACIMA_DE_1000 = new BigDecimal("1000.00");
    private static final Map<String, BigDecimal> CUPONS = Map.of(
            "BEMVINDO10", new BigDecimal("0.10"),
            "VOLTA5", new BigDecimal("0.05"));

    public BigDecimal calcularTotal(Pedido pedido) {
        BigDecimal bruto = pedido.valorBruto();
        BigDecimal comCupom = aplicarDesconto(bruto, percentualCupom(pedido.cupom()));
        return aplicarDesconto(comCupom, percentualFaixa(comCupom));
    }

    private BigDecimal percentualFaixa(BigDecimal valor) {
        if (valor.compareTo(ACIMA_DE_1000) > 0) {
            return new BigDecimal("0.10");
        }
        if (valor.compareTo(ACIMA_DE_500) > 0) {
            return new BigDecimal("0.05");
        }
        return BigDecimal.ZERO;
    }

    private BigDecimal percentualCupom(String cupom) {
        if (cupom == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal percentual = CUPONS.get(cupom);
        if (percentual == null) {
            throw new IllegalArgumentException("cupom desconhecido: " + cupom);
        }
        return percentual;
    }

    private static BigDecimal aplicarDesconto(BigDecimal valor, BigDecimal percentual) {
        return valor.multiply(BigDecimal.ONE.subtract(percentual)).setScale(2, RoundingMode.HALF_EVEN);
    }
}
`;

export const JAVA_DEPOIS = `package br.com.exemplo.pedidos;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class DescontoService {

    private static final BigDecimal ACIMA_DE_500 = new BigDecimal("500.00");
    private static final BigDecimal ACIMA_DE_1000 = new BigDecimal("1000.00");
    private static final Map<String, BigDecimal> CUPONS = Map.of(
            "BEMVINDO10", new BigDecimal("0.10"),
            "VOLTA5", new BigDecimal("0.05"));

    public BigDecimal calcularTotal(Pedido pedido) {
        BigDecimal bruto = pedido.valorBruto();
        BigDecimal percentual = percentualFaixa(bruto).add(percentualCupom(pedido.cupom()));
        return aplicarDesconto(bruto, percentual);
    }

    private BigDecimal percentualFaixa(BigDecimal valor) {
        if (valor.compareTo(ACIMA_DE_1000) > 0) {
            return new BigDecimal("0.10");
        }
        if (valor.compareTo(ACIMA_DE_500) > 0) {
            return new BigDecimal("0.05");
        }
        return BigDecimal.ZERO;
    }

    private BigDecimal percentualCupom(String cupom) {
        if (cupom == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal percentual = CUPONS.get(cupom);
        if (percentual == null) {
            throw new IllegalArgumentException("cupom desconhecido: " + cupom);
        }
        return percentual;
    }

    private static BigDecimal aplicarDesconto(BigDecimal valor, BigDecimal percentual) {
        return valor.multiply(BigDecimal.ONE.subtract(percentual)).setScale(2, RoundingMode.HALF_EVEN);
    }
}
`;

export const TRECHO_TESTE = `    }

    @Test
    void faixaECupomSomamSobreOValorBruto() {
        assertEquals(
                new BigDecimal("900.00"),
                servico.calcularTotal(pedido("1000.00", "VOLTA5")),
                "faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00");
    }

    @Test
`;

export const TRACE_TEST = `[ERROR] Tests run: 7, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.041 s <<< FAILURE! -- in br.com.exemplo.pedidos.DescontoServiceTest
[ERROR] br.com.exemplo.pedidos.DescontoServiceTest.faixaECupomSomamSobreOValorBruto -- Time elapsed: 0.017 s <<< FAILURE!
org.opentest4j.AssertionFailedError: faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00 ==> expected: <900.00> but was: <902.50>
	at org.junit.jupiter.api.AssertionFailureBuilder.build(AssertionFailureBuilder.java:151)
	at org.junit.jupiter.api.AssertionFailureBuilder.buildAndThrow(AssertionFailureBuilder.java:132)
	at org.junit.jupiter.api.AssertEquals.failNotEqual(AssertEquals.java:197)
	at org.junit.jupiter.api.AssertEquals.assertEquals(AssertEquals.java:182)
	at org.junit.jupiter.api.Assertions.assertEquals(Assertions.java:1156)
	at br.com.exemplo.pedidos.DescontoServiceTest.faixaECupomSomamSobreOValorBruto(DescontoServiceTest.java:40)
	at java.base/java.lang.reflect.Method.invoke(Method.java:580)
	at java.base/java.util.ArrayList.forEach(ArrayList.java:1596)
	at java.base/java.util.ArrayList.forEach(ArrayList.java:1596)

[INFO] Running br.com.exemplo.pedidos.PedidosApiApplicationTests
[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.435 s -- in br.com.exemplo.pedidos.PedidosApiApplicationTests
[INFO] 
[INFO] Results:
[INFO] 
[ERROR] Failures: 
[ERROR]   DescontoServiceTest.faixaECupomSomamSobreOValorBruto:40 faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00 ==> expected: <900.00> but was: <902.50>
[INFO] 
[ERROR] Tests run: 11, Failures: 1, Errors: 0, Skipped: 0
[INFO] 
[INFO] ------------------------------------------------------------------------
[INFO] BUILD FAILURE
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  4.611 s
[INFO] Finished at: 2026-10-21T17:32:40Z
[INFO] ------------------------------------------------------------------------
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.5.4:test (default-test) on project pedidos-api: There are test failures.
[ERROR] 
[ERROR] See /work/target/surefire-reports for the individual test results.
[ERROR] See dump files (if any exist) [date].dump, [date]-jvmRun[N].dump and [date].dumpstream.
[ERROR] -> [Help 1]
[ERROR] 
[ERROR] To see the full stack trace of the errors, re-run Maven with the -e switch.
[ERROR] Re-run Maven using the -X switch to enable full debug logging.
[ERROR] 
[ERROR] For more information about the errors and possible solutions, please read the following articles:
[ERROR] [Help 1] http://cwiki.apache.org/confluence/display/MAVEN/MojoFailureException
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

// Saída de `ls -R /mnt/session/uploads`: os três arquivos que a sessão recebe.
export const LISTAGEM_UPLOADS = `/mnt/session/uploads:
pipeline

/mnt/session/uploads/pipeline:
commit.diff
repo.tar.gz
trace.log
`;

export const SAIDA_MVN = `[INFO] Scanning for projects...
[INFO] 
[INFO] ---------------------< br.com.exemplo:pedidos-api >---------------------
[INFO] Building pedidos-api 0.1.0-SNAPSHOT
[INFO]   from pom.xml
[INFO] --------------------------------[ jar ]---------------------------------
[INFO] 
[INFO] --- resources:3.3.1:resources (default-resources) @ pedidos-api ---
[INFO] skip non existing resourceDirectory /work/src/main/resources
[INFO] skip non existing resourceDirectory /work/src/main/resources
[INFO] 
[INFO] --- compiler:3.14.0:compile (default-compile) @ pedidos-api ---
[INFO] Nothing to compile - all classes are up to date.
[INFO] 
[INFO] --- resources:3.3.1:testResources (default-testResources) @ pedidos-api ---
[INFO] Copying 1 resource from src/test/resources to target/test-classes
[INFO] 
[INFO] --- compiler:3.14.0:testCompile (default-testCompile) @ pedidos-api ---
[INFO] Nothing to compile - all classes are up to date.
[INFO] 
[INFO] --- surefire:3.5.4:test (default-test) @ pedidos-api ---
[INFO] Using auto detected provider org.apache.maven.surefire.junitplatform.JUnitPlatformProvider
[INFO] 
[INFO] -------------------------------------------------------
[INFO]  T E S T S
[INFO] -------------------------------------------------------
[INFO] Running br.com.exemplo.pedidos.DescontoServiceTest
[ERROR] Tests run: 7, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: 0.094 s <<< FAILURE! -- in br.com.exemplo.pedidos.DescontoServiceTest
[ERROR] br.com.exemplo.pedidos.DescontoServiceTest.faixaECupomSomamSobreOValorBruto -- Time elapsed: 0.040 s <<< FAILURE!
org.opentest4j.AssertionFailedError: faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00 ==> expected: <900.00> but was: <902.50>
	at org.junit.jupiter.api.AssertionFailureBuilder.build(AssertionFailureBuilder.java:151)
	at org.junit.jupiter.api.AssertionFailureBuilder.buildAndThrow(AssertionFailureBuilder.java:132)
	at org.junit.jupiter.api.AssertEquals.failNotEqual(AssertEquals.java:197)
	at org.junit.jupiter.api.AssertEquals.assertEquals(AssertEquals.java:182)
	at org.junit.jupiter.api.Assertions.assertEquals(Assertions.java:1156)
	at br.com.exemplo.pedidos.DescontoServiceTest.faixaECupomSomamSobreOValorBruto(DescontoServiceTest.java:40)
	at java.base/java.lang.reflect.Method.invoke(Method.java:580)
	at java.base/java.util.ArrayList.forEach(ArrayList.java:1596)
	at java.base/java.util.ArrayList.forEach(ArrayList.java:1596)

[INFO] 
[INFO] Results:
[INFO] 
[ERROR] Failures: 
[ERROR]   DescontoServiceTest.faixaECupomSomamSobreOValorBruto:40 faixa e cupom somam sobre o valor bruto: R$ 1000,00 com 5% de faixa e 5% de cupom devem dar R$ 900,00 ==> expected: <900.00> but was: <902.50>
[INFO] 
[ERROR] Tests run: 7, Failures: 1, Errors: 0, Skipped: 0
[INFO] 
[INFO] ------------------------------------------------------------------------
[INFO] BUILD FAILURE
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  1.482 s
[INFO] Finished at: 2026-10-21T17:32:43Z
[INFO] ------------------------------------------------------------------------
[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.5.4:test (default-test) on project pedidos-api: There are test failures.
[ERROR] 
[ERROR] See /work/target/surefire-reports for the individual test results.
[ERROR] See dump files (if any exist) [date].dump, [date]-jvmRun[N].dump and [date].dumpstream.
[ERROR] -> [Help 1]
[ERROR] 
[ERROR] To see the full stack trace of the errors, re-run Maven with the -e switch.
[ERROR] Re-run Maven using the -X switch to enable full debug logging.
[ERROR] 
[ERROR] For more information about the errors and possible solutions, please read the following articles:
[ERROR] [Help 1] http://cwiki.apache.org/confluence/display/MAVEN/MojoFailureException
`;
