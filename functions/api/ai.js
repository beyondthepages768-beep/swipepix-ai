const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.AI) {
      return Response.json(
        { error: "AI backend is not connected. Add the Cloudflare AI binding." },
        { status: 503 }
      );
    }

    const data = await request.json();

    const mode = data.mode;
    const prompt = String(data.prompt || "").trim();

    if (!["generate", "edit"].includes(mode)) {
      return Response.json(
        { error: "Invalid AI mode." },
        { status: 400 }
      );
    }

    if (!prompt || prompt.length > 1000) {
      return Response.json(
        { error: "Enter a prompt between 1 and 1000 characters." },
        { status: 400 }
      );
    }

    const width = Math.min(1024, Math.max(512, Number(data.width) || 1024));
    const height = Math.min(1024, Math.max(512, Number(data.height) || 1024));

    const form = new FormData();

    form.append("prompt", prompt);
    form.append("width", String(width));
    form.append("height", String(height));

    if (mode === "edit") {
      if (!data.imageBase64) {
        return Response.json(
          { error: "Please upload a photo to edit." },
          { status: 400 }
        );
      }

      const match = String(data.imageBase64).match(
        /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/
      );

      if (!match) {
        return Response.json(
          { error: "Invalid image format." },
          { status: 400 }
        );
      }

      const mime = match[1] === "jpeg"
        ? "image/jpeg"
        : `image/${match[1]}`;

      const binary = atob(match[2]);

      if (binary.length > 8 * 1024 * 1024) {
        return Response.json(
          { error: "Image must be smaller than 8 MB." },
          { status: 413 }
        );
      }

      const bytes = Uint8Array.from(
        binary,
        character => character.charCodeAt(0)
      );

      form.append(
        "input_image_0",
        new Blob([bytes], { type: mime }),
        "source-image"
      );
    }

    const formResponse = new Response(form);

    const result = await env.AI.run(MODEL, {
      multipart: {
        body: formResponse.body,
        contentType: formResponse.headers.get("content-type")
      }
    });

    if (!result || !result.image) {
      throw new Error("AI did not return an image.");
    }

    return Response.json({
      success: true,
      image: "data:image/png;base64," + result.image,
      mode
    });

  } catch (error) {
    console.error("SwipePix AI error:", error);

    return Response.json(
      {
        success: false,
        error: "AI generation failed. Please try again.",
        details: error.message
      },
      { status: 500 }
    );
  }
}
