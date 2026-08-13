import { mount } from "svelte";
import Prompt from "./Prompt.svelte";
import "../assets/app.css";

mount(Prompt, { target: document.getElementById("app")! });
