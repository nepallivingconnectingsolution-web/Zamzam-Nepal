import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PhotoUploader } from "./photo-uploader";

const upload = vi.fn();
const del = vi.fn();
vi.mock("@/api/client", async (orig) => {
  const actual = await orig<typeof import("@/api/client")>();
  return { ...actual, api: { ...actual.api, upload: (...a: unknown[]) => upload(...a), delete: (...a: unknown[]) => del(...a) } };
});

beforeEach(() => {
  upload.mockReset();
  del.mockReset();
});

describe("PhotoUploader", () => {
  it("renders one thumbnail per photo plus an add tile under the max", () => {
    render(
      <PhotoUploader photos={["https://cdn/a.jpg"]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={() => {}} />,
    );
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("Add")).toBeInTheDocument();
  });

  it("hides the add tile once the max is reached", () => {
    render(
      <PhotoUploader photos={["a", "b"]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={() => {}} max={2} />,
    );
    expect(screen.queryByText("Add")).not.toBeInTheDocument();
  });

  it("uploads a selected file and calls onChange on success", async () => {
    upload.mockResolvedValue({});
    const onChange = vi.fn();
    render(<PhotoUploader photos={[]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={onChange} />);

    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(upload).toHaveBeenCalledWith("/x/photos", expect.any(FormData)));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("rejects an oversized file client-side without calling the API", () => {
    const onChange = vi.fn();
    render(<PhotoUploader photos={[]} uploadUrl="/x/photos" deleteUrl={() => "/x/photos/y"} onChange={onChange} />);

    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [big] } });

    expect(upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("deletes a photo by its derived publicId and calls onChange", async () => {
    del.mockResolvedValue({});
    const onChange = vi.fn();
    const deleteUrl = vi.fn((publicId: string) => `/x/photos/${publicId}`);
    render(
      <PhotoUploader
        photos={["https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/zamzam-hotel/abc123"]}
        uploadUrl="/x/photos"
        deleteUrl={deleteUrl}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Remove photo"));

    await waitFor(() => expect(del).toHaveBeenCalledWith("/x/photos/zamzam-hotel%2Fabc123"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });
});
