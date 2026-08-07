const fs = require('fs');

const html = fs.readFileSync('/Users/abuzar/Desktop/Astrawatch/docs/api-reference.html', 'utf8');

// Extract the JS array S
const match = html.match(/const S = (\[[\s\S]*?\]);\n\n\/\/ ── state/);
if (!match) {
  console.error("Failed to match S array");
  process.exit(1);
}

const servicesData = eval(match[1]);

function createOpenApiSpec(servicesFilter = null, title = "AstraWatch Unified API", version = "1.0.0") {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: title,
      description: "Official OpenAPI 3.0 specification for AstraWatch autonomous telemetry, anomaly detection, incident orchestration, and K8s self-healing microservices.",
      version: version,
      contact: {
        name: "AstraWatch Engineering",
        url: "https://astrawatch.io"
      }
    },
    servers: [
      { url: "http://localhost:8080/v1", description: "Collector Service (:8080)" },
      { url: "http://localhost:8000/v1", description: "Analyzer Service (:8000)" },
      { url: "http://localhost:8082/api/v1", description: "Orchestrator Service (:8082)" },
      { url: "http://localhost:8081/healthz", description: "K8s Operator Service (:8081 healthz)" },
      { url: "http://localhost:8084", description: "Realtime Gateway (:8084)" },
      { url: "http://localhost:8085/api/v1", description: "Payment Service (:8085)" }
    ],
    tags: [],
    paths: {},
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your Bearer JWT token issued by POST /api/v1/auth/login"
        }
      },
      schemas: {}
    }
  };

  const targetServices = servicesFilter ? servicesData.filter(s => servicesFilter.includes(s.id)) : servicesData;

  targetServices.forEach(svc => {
    svc.groups.forEach(g => {
      const tagName = `${svc.name}: ${g.label}`;
      if (!spec.tags.some(t => t.name === tagName)) {
        spec.tags.push({ name: tagName, description: `${svc.sub} - ${g.label}` });
      }

      g.eps.forEach(ep => {
        const pathStr = ep.path;
        if (!spec.paths[pathStr]) {
          spec.paths[pathStr] = {};
        }

        const methodStr = (ep.m === 'WS' ? 'get' : ep.m).toLowerCase();

        const operation = {
          tags: [tagName],
          summary: ep.name,
          description: ep.desc,
          operationId: ep.id,
          parameters: [],
          responses: {}
        };

        if (ep.auth) {
          operation.security = [{ BearerAuth: [] }];
        }

        if (ep.params && ep.params.length) {
          ep.params.forEach(p => {
            operation.parameters.push({
              name: p.n,
              in: p.i === 'path' ? 'path' : 'query',
              required: p.r || p.i === 'path',
              description: p.d,
              schema: {
                type: p.t.includes('integer') ? 'integer' : p.t.includes('boolean') ? 'boolean' : 'string'
              }
            });
          });
        }

        if (ep.body) {
          let parsedEx = ep.body.ex;
          try { parsedEx = JSON.parse(ep.body.ex); } catch(e){}
          operation.requestBody = {
            description: ep.body.s,
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
                example: parsedEx
              }
            }
          };
        }

        if (ep.resp) {
          let parsedRespEx = ep.resp.ex;
          try { parsedRespEx = JSON.parse(ep.resp.ex); } catch(e){}
          const statusCode = String(ep.resp.code || 200);
          operation.responses[statusCode] = {
            description: "Successful response",
            content: {
              "application/json": {
                schema: { type: "object" },
                example: parsedRespEx
              }
            }
          };
        } else {
          operation.responses["200"] = { description: "Successful response" };
        }

        spec.paths[pathStr][methodStr] = operation;
      });
    });
  });

  return spec;
}

// Write combined and per-service openapi.json files
fs.writeFileSync('/Users/abuzar/Desktop/Astrawatch/docs/openapi/openapi.json', JSON.stringify(createOpenApiSpec(), null, 2));
console.log("Wrote docs/openapi/openapi.json");

servicesData.forEach(svc => {
  const svcSpec = createOpenApiSpec([svc.id], `AstraWatch ${svc.name} API`, "1.0.0");
  fs.writeFileSync(`/Users/abuzar/Desktop/Astrawatch/docs/openapi/${svc.id}.json`, JSON.stringify(svcSpec, null, 2));
  console.log(`Wrote docs/openapi/${svc.id}.json`);
});
