import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhotoGallery } from "./photo-gallery";

describe("PhotoGallery", () => {
  it("renders nothing when there are no photos", () => {
    const { container } = render(<PhotoGallery photos={[]} alt="Hotel" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a single clickable hero photo, not the mobile/desktop split, for one photo", () => {
    render(<PhotoGallery photos={["a.jpg"]} alt="Hotel" />);
    expect(screen.getAllByRole("button", { name: "View photo 1 of 1" })).toHaveLength(1);
  });

  it("opens the lightbox at index 0 when the hero photo is clicked", () => {
    render(<PhotoGallery photos={["a.jpg", "b.jpg", "c.jpg"]} alt="Hotel" />);
    fireEvent.click(screen.getAllByRole("button", { name: "View photo 1 of 3" })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("opens the lightbox at the clicked tile's own index", () => {
    render(<PhotoGallery photos={["a.jpg", "b.jpg", "c.jpg"]} alt="Hotel" />);
    fireEvent.click(screen.getByRole("button", { name: "View photo 3 of 3" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("shows a +N more overlay on the last desktop tile when there are more than 5 photos", () => {
    const photos = ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg", "f.jpg", "g.jpg"];
    render(<PhotoGallery photos={photos} alt="Hotel" />);
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("closes the lightbox from the gallery", async () => {
    render(<PhotoGallery photos={["a.jpg", "b.jpg"]} alt="Hotel" />);
    fireEvent.click(screen.getAllByRole("button", { name: "View photo 1 of 2" })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
