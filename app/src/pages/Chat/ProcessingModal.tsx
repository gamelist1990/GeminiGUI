import { ProcessingModalProps } from "./types";
import { t } from "../../utils/i18n";

function ProcessingModal({ message, elapsedSeconds }: ProcessingModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-content processing-modal">
        <div className="processing-content">
          <div className="processing-spinner">
            <div className="spinner"></div>
          </div>
          <h3>{message}</h3>
          <div className="processing-dots">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
          <div className="processing-elapsed">{t("chat.processing.elapsedTime").replace("{elapsedSeconds}", elapsedSeconds.toString())}</div>
        </div>
      </div>
    </div>
  );
}

export default ProcessingModal;