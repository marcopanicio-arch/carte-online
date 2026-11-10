import { ImageResponse } from "next/og";

// Icone PNG per l'installazione (Android vuole 192 e 512, iPhone 180).
const SIZES = [180, 192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: `${s}.png` }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = Number.parseInt(raw, 10);
  if (!SIZES.includes(size as (typeof SIZES)[number])) {
    return new Response("Not found", { status: 404 });
  }
  const u = size / 64;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1d5a39",
        }}
      >
        <div
          style={{
            width: 30 * u,
            height: 46 * u,
            borderRadius: 5 * u,
            background: "#fbf6e8",
            border: `${1.5 * u}px solid #c9b892`,
            transform: "rotate(-8deg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 20 * u,
              height: 20 * u,
              borderRadius: "50%",
              background: "#e0aa3e",
              border: `${2 * u}px solid #8a5a12`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 10 * u,
                height: 10 * u,
                borderRadius: "50%",
                border: `${1.5 * u}px solid #8a5a12`,
              }}
            />
          </div>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
