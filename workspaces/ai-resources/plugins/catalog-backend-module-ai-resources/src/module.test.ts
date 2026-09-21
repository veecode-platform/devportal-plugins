import { startTestBackend } from "@backstage/backend-test-utils";
import {
  aiResourceEntityV1alpha1Validator,
  skillAiResourceEntityV1alpha1Validator,
} from "@backstage/catalog-model/alpha";
import { catalogModelExtensionPoint } from "@backstage/plugin-catalog-node/alpha";
import catalogModuleAiResources from "./index";
import { catalogModuleAiResources as moduleFeature } from "./module";

describe("catalogModuleAiResources", () => {
  it("exports the registered catalog backend module", () => {
    expect(catalogModuleAiResources).toBe(moduleFeature);
    expect(catalogModuleAiResources).toMatchObject({
      $$type: "@backstage/BackendFeature",
    });
  });

  it("registers the AI catalog models with the catalog model extension point", async () => {
    const addModelSource = jest.fn();

    await startTestBackend({
      features: [catalogModuleAiResources],
      extensionPoints: [[catalogModelExtensionPoint, { addModelSource }]],
    });

    expect(addModelSource).toHaveBeenCalledTimes(1);
    const [source] = addModelSource.mock.calls[0] as [
      import("@backstage/catalog-model/alpha").CatalogModelSource,
    ];
    const chunks = [];
    for await (const chunk of source.read()) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    const [{ data }] = chunks;

    expect(data.map(({ layer }) => layer.layerId)).toEqual(
      expect.arrayContaining([
        "catalog.backstage.io/kind-ai-resource",
        "catalog.backstage.io/kind-api-mcp-server",
      ]),
    );
  });

  it("validates the workspace AiResource fixture shape", async () => {
    const fixture = {
      apiVersion: "backstage.io/v1alpha1",
      kind: "AiResource",
      metadata: { name: "template-builder" },
      spec: {
        type: "skill",
        lifecycle: "production",
        owner: "group:default/platform-team",
        agents: ["devportal"],
      },
    };

    await expect(
      aiResourceEntityV1alpha1Validator.check(fixture),
    ).resolves.toBe(true);
    await expect(
      skillAiResourceEntityV1alpha1Validator.check(fixture),
    ).resolves.toBe(true);
  });
});
