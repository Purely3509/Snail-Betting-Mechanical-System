import { handleOptionsRequest, jsonResponse } from "../_shared/cors.ts";
import { submitAction } from "../_shared/game-service.ts";

Deno.serve(async (request) => {
  const optionsResponse = handleOptionsRequest(request);
  if (optionsResponse) return optionsResponse;

  try {
    const payload = await request.json();
    return jsonResponse(await submitAction(request, payload));
  } catch (error) {
    const status = error.message === "STALE_VERSION" ? 409 : 400;
    return jsonResponse({ error: error.message }, { status });
  }
});
