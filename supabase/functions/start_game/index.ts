import { handleOptionsRequest, jsonResponse } from "../_shared/cors.ts";
import { startGame } from "../_shared/game-service.ts";

Deno.serve(async (request) => {
  const optionsResponse = handleOptionsRequest(request);
  if (optionsResponse) return optionsResponse;

  try {
    return jsonResponse(await startGame(request));
  } catch (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }
});
