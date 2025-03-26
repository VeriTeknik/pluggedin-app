"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/providers/theme-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { FontFamily, fontFamilies, setFont } from "@/lib/font-utils";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

const fonts = [
  { value: "geist", label: "Geist Sans (Default)" },
  { value: "quicksand", label: "Quicksand" },
  { value: "nunito", label: "Nunito" },
  { value: "poppins", label: "Poppins" },
  { value: "roboto", label: "Roboto" },
  { value: "ubuntu", label: "Ubuntu" },
  { value: "varela-round", label: "Varela Round" },
  { value: "work-sans", label: "Work Sans" },
  { value: "zilla-slab", label: "Zilla Slab" },
  { value: "comfortaa", label: "Comfortaa" },
];

export function ThemeSection() {
  const { theme, setTheme } = useTheme();
  const [currentFont, setCurrentFont] = useState<FontFamily>("geist");
  
  // Get the saved font on component mount
  useEffect(() => {
    const savedFont = localStorage.getItem("pluggedin-font") as FontFamily;
    if (savedFont && savedFont in fontFamilies) {
      setCurrentFont(savedFont);
    }
  }, []);

  const handleFontChange = (fontName: string) => {
    setFont(fontName as FontFamily);
    setCurrentFont(fontName as FontFamily);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Appearance</CardTitle>
          <ThemeToggle />
        </div>
        <CardDescription>
          Customize the appearance of the application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-3">Color Theme</h3>
            <RadioGroup 
              defaultValue={theme} 
              onValueChange={(value: string) => setTheme(value as Theme)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="light" id="light" />
                <Label htmlFor="light" className="flex items-center gap-1.5 cursor-pointer">
                  <Sun className="h-4 w-4" />
                  Light
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dark" id="dark" />
                <Label htmlFor="dark" className="flex items-center gap-1.5 cursor-pointer">
                  <Moon className="h-4 w-4" />
                  Dark
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="system" id="system" />
                <Label htmlFor="system" className="flex items-center gap-1.5 cursor-pointer">
                  <Monitor className="h-4 w-4" />
                  System
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Font</h3>
            <Select value={currentFont} onValueChange={handleFontChange}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select a font" />
              </SelectTrigger>
              <SelectContent>
                {fonts.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 