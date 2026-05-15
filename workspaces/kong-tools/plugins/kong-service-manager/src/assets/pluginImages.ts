import defaultImg from './default.png';
import acl from './plugins/kong-inc_acl.png';
import acme from './plugins/kong-inc_acme.png';
import aiAzureContentSafety from './plugins/kong-inc_ai-azure-content-safety.png';
import aiPromptDecorator from './plugins/kong-inc_ai-prompt-decorator.png';
import aiPromptGuard from './plugins/kong-inc_ai-prompt-guard.png';
import aiPromptTemplate from './plugins/kong-inc_ai-prompt-template.png';
import aiProxy from './plugins/kong-inc_ai-proxy.png';
import aiRateLimitingAdvanced from './plugins/kong-inc_ai-rate-limiting-advanced.png';
import aiRequestTransformer from './plugins/kong-inc_ai-request-transformer.png';
import aiResponseTransformer from './plugins/kong-inc_ai-response-transformer.png';
import appDynamics from './plugins/kong-inc_app-dynamics.png';
import applicationRegistration from './plugins/kong-inc_application-registration.png';
import awsLambda from './plugins/kong-inc_aws-lambda.png';
import azureFunctions from './plugins/kong-inc_azure-functions.png';
import basicAuth from './plugins/kong-inc_basic-auth.png';
import botDetection from './plugins/kong-inc_bot-detection.png';
import canary from './plugins/kong-inc_canary.png';
import correlationId from './plugins/kong-inc_correlation-id.png';
import cors from './plugins/kong-inc_cors.png';
import datadog from './plugins/kong-inc_datadog.png';
import degraphql from './plugins/kong-inc_degraphql.png';
import exitTransformer from './plugins/kong-inc_exit-transformer.png';
import fileLog from './plugins/kong-inc_file-log.png';
import forwardProxy from './plugins/kong-inc_forward-proxy.png';
import graphqlProxyCacheAdvanced from './plugins/kong-inc_graphql-proxy-cache-advanced.png';
import graphqlRateLimitingAdvanced from './plugins/kong-inc_graphql-rate-limiting-advanced.png';
import grpcGateway from './plugins/kong-inc_grpc-gateway.png';
import grpcWeb from './plugins/kong-inc_grpc-web.png';
import hmacAuth from './plugins/kong-inc_hmac-auth.png';
import httpLog from './plugins/kong-inc_http-log.png';
import ipRestriction from './plugins/kong-inc_ip-restriction.png';
import jq from './plugins/kong-inc_jq.png';
import jweDecrypt from './plugins/kong-inc_jwe-decrypt.png';
import jwt from './plugins/kong-inc_jwt.png';
import jwtSigner from './plugins/kong-inc_jwt-signer.png';
import kafkaLog from './plugins/kong-inc_kafka-log.png';
import kafkaUpstream from './plugins/kong-inc_kafka-upstream.png';
import keyAuth from './plugins/kong-inc_key-auth.png';
import keyAuthEnc from './plugins/kong-inc_key-auth-enc.png';
import ldapAuth from './plugins/kong-inc_ldap-auth.png';
import ldapAuthAdvanced from './plugins/kong-inc_ldap-auth-advanced.png';
import loggly from './plugins/kong-inc_loggly.png';
import mocking from './plugins/kong-inc_mocking.png';
import mtlsAuth from './plugins/kong-inc_mtls-auth.png';
import oasValidation from './plugins/kong-inc_oas-validation.png';
import oauth2 from './plugins/kong-inc_oauth2.png';
import oauth2Introspection from './plugins/kong-inc_oauth2-introspection.png';
import opa from './plugins/kong-inc_opa.png';
import openidConnect from './plugins/kong-inc_openid-connect.png';
import opentelemetry from './plugins/kong-inc_opentelemetry.png';
import openwhisk from './plugins/kong-inc_openwhisk.png';
import postFunction from './plugins/kong-inc_post-function.png';
import preFunction from './plugins/kong-inc_pre-function.png';
import prometheus from './plugins/kong-inc_prometheus.png';
import proxyCache from './plugins/kong-inc_proxy-cache.png';
import proxyCacheAdvanced from './plugins/kong-inc_proxy-cache-advanced.png';
import rateLimiting from './plugins/kong-inc_rate-limiting.png';
import rateLimitingAdvanced from './plugins/kong-inc_rate-limiting-advanced.png';
import requestSizeLimiting from './plugins/kong-inc_request-size-limiting.png';
import requestTermination from './plugins/kong-inc_request-termination.png';
import requestTransformer from './plugins/kong-inc_request-transformer.png';
import requestTransformerAdvanced from './plugins/kong-inc_request-transformer-advanced.png';
import requestValidator from './plugins/kong-inc_request-validator.png';
import responseRatelimiting from './plugins/kong-inc_response-ratelimiting.png';
import responseTransformer from './plugins/kong-inc_response-transformer.png';
import responseTransformerAdvanced from './plugins/kong-inc_response-transformer-advanced.png';
import routeByHeader from './plugins/kong-inc_route-by-header.png';
import routeTransformerAdvanced from './plugins/kong-inc_route-transformer-advanced.png';
import saml from './plugins/kong-inc_saml.png';
import session from './plugins/kong-inc_session.png';
import statsd from './plugins/kong-inc_statsd.png';
import statsdAdvanced from './plugins/kong-inc_statsd-advanced.png';
import syslog from './plugins/kong-inc_syslog.png';
import tcpLog from './plugins/kong-inc_tcp-log.png';
import tlsHandshakeModifier from './plugins/kong-inc_tls-handshake-modifier.png';
import tlsMetadataHeaders from './plugins/kong-inc_tls-metadata-headers.png';
import udpLog from './plugins/kong-inc_udp-log.png';
import upstreamTimeout from './plugins/kong-inc_upstream-timeout.png';
import vaultAuth from './plugins/kong-inc_vault-auth.png';
import websocketSizeLimit from './plugins/kong-inc_websocket-size-limit.png';
import websocketValidator from './plugins/kong-inc_websocket-validator.png';
import xmlThreatProtection from './plugins/kong-inc_xml-threat-protection.png';
import zipkin from './plugins/kong-inc_zipkin.png';
import impervaAppsec from './plugins/imperva_imp-appsec-connector.png';
import okta from './plugins/okta_okta.png';

/** Map of plugin slug to imported image asset */
const pluginImageMap: Record<string, string> = {
  'acl': acl,
  'acme': acme,
  'ai-azure-content-safety': aiAzureContentSafety,
  'ai-prompt-decorator': aiPromptDecorator,
  'ai-prompt-guard': aiPromptGuard,
  'ai-prompt-template': aiPromptTemplate,
  'ai-proxy': aiProxy,
  'ai-rate-limiting-advanced': aiRateLimitingAdvanced,
  'ai-request-transformer': aiRequestTransformer,
  'ai-response-transformer': aiResponseTransformer,
  'app-dynamics': appDynamics,
  'application-registration': applicationRegistration,
  'aws-lambda': awsLambda,
  'azure-functions': azureFunctions,
  'basic-auth': basicAuth,
  'bot-detection': botDetection,
  'canary': canary,
  'correlation-id': correlationId,
  'cors': cors,
  'datadog': datadog,
  'degraphql': degraphql,
  'exit-transformer': exitTransformer,
  'file-log': fileLog,
  'forward-proxy': forwardProxy,
  'graphql-proxy-cache-advanced': graphqlProxyCacheAdvanced,
  'graphql-rate-limiting-advanced': graphqlRateLimitingAdvanced,
  'grpc-gateway': grpcGateway,
  'grpc-web': grpcWeb,
  'hmac-auth': hmacAuth,
  'http-log': httpLog,
  'ip-restriction': ipRestriction,
  'jq': jq,
  'jwe-decrypt': jweDecrypt,
  'jwt': jwt,
  'jwt-signer': jwtSigner,
  'kafka-log': kafkaLog,
  'kafka-upstream': kafkaUpstream,
  'key-auth': keyAuth,
  'key-auth-enc': keyAuthEnc,
  'ldap-auth': ldapAuth,
  'ldap-auth-advanced': ldapAuthAdvanced,
  'loggly': loggly,
  'mocking': mocking,
  'mtls-auth': mtlsAuth,
  'oas-validation': oasValidation,
  'oauth2': oauth2,
  'oauth2-introspection': oauth2Introspection,
  'opa': opa,
  'openid-connect': openidConnect,
  'opentelemetry': opentelemetry,
  'openwhisk': openwhisk,
  'post-function': postFunction,
  'pre-function': preFunction,
  'prometheus': prometheus,
  'proxy-cache': proxyCache,
  'proxy-cache-advanced': proxyCacheAdvanced,
  'rate-limiting': rateLimiting,
  'rate-limiting-advanced': rateLimitingAdvanced,
  'request-size-limiting': requestSizeLimiting,
  'request-termination': requestTermination,
  'request-transformer': requestTransformer,
  'request-transformer-advanced': requestTransformerAdvanced,
  'request-validator': requestValidator,
  'response-ratelimiting': responseRatelimiting,
  'response-transformer': responseTransformer,
  'response-transformer-advanced': responseTransformerAdvanced,
  'route-by-header': routeByHeader,
  'route-transformer-advanced': routeTransformerAdvanced,
  'saml': saml,
  'session': session,
  'statsd': statsd,
  'statsd-advanced': statsdAdvanced,
  'syslog': syslog,
  'tcp-log': tcpLog,
  'tls-handshake-modifier': tlsHandshakeModifier,
  'tls-metadata-headers': tlsMetadataHeaders,
  'udp-log': udpLog,
  'upstream-timeout': upstreamTimeout,
  'vault-auth': vaultAuth,
  'websocket-size-limit': websocketSizeLimit,
  'websocket-validator': websocketValidator,
  'xml-threat-protection': xmlThreatProtection,
  'zipkin': zipkin,
  'imp-appsec-connector': impervaAppsec,
  'okta': okta,
};

export function getPluginImage(slug: string): string {
  return pluginImageMap[slug] ?? defaultImg;
}
