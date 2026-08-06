"use client";

import { Category, CATEGORY_LABELS } from "@/types/category";

interface CategorySelectorProps {
  selectedCategories: Category[];
  onChange: (categories: Category[]) => void;
  maxCategories?: number;
}

export function CategorySelector({
  selectedCategories,
  onChange,
  maxCategories = 5,
}: CategorySelectorProps) {
  const handleToggleCategory = (category: Category) => {
    if (selectedCategories.includes(category)) {
      onChange(selectedCategories.filter((c) => c !== category));
    } else if (selectedCategories.length < maxCategories) {
      onChange([...selectedCategories, category]);
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
        const isSelected = selectedCategories.includes(category as Category);
        return (
          <div
            key={category}
            className={`p-3 rounded-control border cursor-pointer transition-colors duration-fast ${
              isSelected
                ? "bg-accent-soft border-accent"
                : "bg-surface-raised hover:bg-surface-sunken border-line"
            } ${selectedCategories.length >= maxCategories && !isSelected ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={() => {
              if (!(selectedCategories.length >= maxCategories && !isSelected)) {
                handleToggleCategory(category as Category);
              }
            }}
          >
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                className="h-4 w-4 text-accent rounded border-line focus:ring-ring"
                disabled={selectedCategories.length >= maxCategories && !isSelected}
              />
              <span className="text-sm font-medium text-ink">{label}</span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
