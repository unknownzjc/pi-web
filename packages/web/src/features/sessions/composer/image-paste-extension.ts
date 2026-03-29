import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface ImageAttachment {
  id: string;
  filename: string;
  mediaType: string;
  base64: string;
}

function readFileAsAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({
        id: crypto.randomUUID(),
        filename: file.name,
        mediaType: file.type,
        base64,
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function createImagePasteExtension(onImages: (images: ImageAttachment[]) => void) {
  return Extension.create({
    name: "imagePaste",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("imagePaste"),
          props: {
            handlePaste(_view, event) {
              const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
                f.type.startsWith("image/"),
              );
              if (files.length === 0) return false;
              event.preventDefault();
              Promise.all(files.map(readFileAsAttachment)).then(onImages);
              return true;
            },
            handleDrop(_view, event) {
              const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
                f.type.startsWith("image/"),
              );
              if (files.length === 0) return false;
              event.preventDefault();
              Promise.all(files.map(readFileAsAttachment)).then(onImages);
              return true;
            },
          },
        }),
      ];
    },
  });
}
