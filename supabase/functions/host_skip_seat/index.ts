import { handleOptionsRequest, jsonResponse } from "../_shared/cors.ts";
import { hostSkip } from "../_shared/game-service.ts";

Deno.serve(async (request) => {
  const optionsResponse = handleOptionsRequest(request);
  if (optionsResponse) return optionsResponse;

  try {
    const payload = await request.json();
    return jsonResponse(await hostSkip(request, payload));
  } catch (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }
});
