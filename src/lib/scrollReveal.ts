import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Only the triggers created here are tracked, so re-initialising never kills
// triggers that belong to other systems (e.g. the 3D scene in lib/scene).
let owned: ScrollTrigger[] = [];

function track(tween: gsap.core.Tween): void {
  if (tween.scrollTrigger) owned.push(tween.scrollTrigger);
}

export function initScrollReveal() {
  gsap.registerPlugin(ScrollTrigger);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Clear only our own triggers from a previous init (Astro view transitions safety).
  owned.forEach((t) => t.kill());
  owned = [];

  const items = gsap.utils.toArray<HTMLElement>('.reveal-up');

  if (reduceMotion) {
    gsap.set(items, { opacity: 1, y: 0 });
    return;
  }

  items.forEach((el) => {
    track(
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
      )
    );
  });

  const staggerGroups = gsap.utils.toArray<HTMLElement>('.reveal-stagger');
  staggerGroups.forEach((group) => {
    const children = group.children;
    track(
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
      )
    );
  });
}
