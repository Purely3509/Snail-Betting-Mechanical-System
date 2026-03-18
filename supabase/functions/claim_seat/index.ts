import { claimSeat } from "../_shared/game-service.ts";
import { handleOptionsRequest, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  const optionsResponse = handleOptionsRequest(request);
  if (optionsResponse) return optionsResponse;

  try {
    const payload = await request.json();
    return jsonResponse(await claimSeat(payload));
  } catch (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }
});
