/**
 * Export a Recharts chart container as SVG or PNG.
 */

export function exportChartAsSvg(containerId: string): string | null {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const svg = container.querySelector("svg");
  if (!svg) return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;

  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const box = svg.getBoundingClientRect();
  if (!clone.getAttribute("width")) {
    clone.setAttribute("width", String(Math.round(box.width)));
  }
  if (!clone.getAttribute("height")) {
    clone.setAttribute("height", String(Math.round(box.height)));
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(clone);
}

export function exportChartAsPng(
  svgString: string,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to get canvas context"));
        return;
      }

      const isDark = document.documentElement.classList.contains("dark");
      ctx.fillStyle = isDark ? "#0f172a" : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG image"));
    };

    img.src = url;
  });
}

export async function saveChart(
  containerId: string,
  format: "png" | "svg",
  defaultName: string,
): Promise<void> {
  const svgString = exportChartAsSvg(containerId);
  if (!svgString) {
    throw new Error("Chart SVG not found");
  }

  if (format === "svg") {
    const result = await window.api.exportChartImage({
      data: svgString,
      defaultName,
      format: "svg",
    });
    if (result.canceled || !result.filePath) return;

    console.log("Chart saved to", result.filePath);
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) throw new Error("Chart container not found");

  const svg = container.querySelector("svg");
  if (!svg) throw new Error("Chart SVG not found");
  const box = svg.getBoundingClientRect();

  const pngDataUrl = await exportChartAsPng(
    svgString,
    Math.round(box.width),
    Math.round(box.height),
  );
  const result = await window.api.exportChartImage({
    data: pngDataUrl,
    defaultName,
    format: "png",
  });
  if (result.canceled || !result.filePath) return;

  console.log("Chart saved to", result.filePath);
}
