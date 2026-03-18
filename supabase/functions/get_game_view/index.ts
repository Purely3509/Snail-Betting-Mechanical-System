import { getGameView } from "../_shared/game-service.ts";
import { handleOptionsRequest, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  const optionsResponse = handleOptionsRequest(request);
  if (optionsResponse) return optionsResponse;

  try {
    return jsonResponse(await getGameView(request));
  } catch (error) {
    return jsonResponse({ error: error.message }, { status: 401 });
  }
});
