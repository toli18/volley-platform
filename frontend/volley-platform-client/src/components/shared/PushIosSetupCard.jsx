import { isIosDevice, isStandalonePwa, isInAppBrowser } from "../../utils/parentPush";

/** Sticky checklist for iPhone / in-app browsers before enabling push. */
export default function PushIosSetupCard({ forceShow = false }) {
  const ios = isIosDevice();
  const standalone = isStandalonePwa();
  const inApp = isInAppBrowser();

  if (!forceShow && !ios && !inApp) return null;
  if (ios && standalone && !inApp) return null;

  return (
    <div className="pushIosSetupCard" role="note">
      <p className="pushIosSetupCard__title">За iPhone — направете това първо</p>
      <ol className="pushIosSetupCard__steps">
        {inApp ? (
          <li>Отворете линка в Safari (не от Facebook / Viber / Instagram).</li>
        ) : null}
        <li>В Safari натиснете Сподели (квадрат със стрелка).</li>
        <li>Изберете „Добави на началния екран“.</li>
        <li>Отворете новата икона от екрана на телефона.</li>
        <li>После натиснете „Включи известия“ тук.</li>
      </ol>
    </div>
  );
}
