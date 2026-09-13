import { describe, expect, it, vi } from "vitest";
import { ConfirmationService } from "../src/services/confirmationService.js";

describe("confirmation service", () => {
  it("requiere una segunda interaccion para acciones sensibles", async () => {
    const service = new ConfirmationService();
    const reply = vi.fn();
    const action = vi.fn();
    await service.request({ user: { id: "owner" }, reply } as any, "Eliminar ticket?", action);

    const payload = reply.mock.calls[0]![0] as any;
    const confirmButton = payload.components[0].components[0];
    const confirmId = confirmButton.data.custom_id as string;
    const update = vi.fn();
    const handled = await service.handle({ customId: confirmId, user: { id: "owner" }, update } as any);

    expect(handled).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("bloquea confirmaciones de otros usuarios", async () => {
    const service = new ConfirmationService();
    const reply = vi.fn();
    await service.request({ user: { id: "owner" }, reply } as any, "Eliminar ticket?", vi.fn());

    const payload = reply.mock.calls[0]![0] as any;
    const confirmId = payload.components[0].components[0].data.custom_id as string;
    const intruderReply = vi.fn();
    const handled = await service.handle({ customId: confirmId, user: { id: "intruder" }, reply: intruderReply } as any);

    expect(handled).toBe(true);
    expect(intruderReply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
  });
});
