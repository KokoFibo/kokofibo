import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export function initScrollReveal() {
  gsap.registerPlugin(ScrollTrigger);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Clear any triggers from a previous page (Astro view transitions safety).
  ScrollTrigger.getAll().forEach((t) => t.kill());

  const items = gsap.utils.toArray<HTMLElement>('.reveal-up');

  if (reduceMotion) {
    gsap.set(items, { opacity: 1, y: 0 });
    return;
  }

  items.forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 28 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%',
          once: true,
        },
      }
    );
  });

  const staggerGroups = gsap.utils.toArray<HTMLElement>('.reveal-stagger');
  staggerGroups.forEach((group) => {
    const children = group.children;
    gsap.fromTo(
      children,
      { opacity: 0, y: 22 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: group,
          start: 'top 85%',
          once: true,
        },
      }
    );
  });
}
