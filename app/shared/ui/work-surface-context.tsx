"use client";
import { createContext, useContext } from "react";
export const WorkFormContext = createContext(false);
export const WorkSurfaceContext = createContext("workspace");
export const useWorkForm = () => useContext(WorkFormContext);
