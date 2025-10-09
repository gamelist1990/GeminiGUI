import { ProcessingModalProps } from "./types";
import { t } from "../../utils/i18n";

function ProcessingModal({ 
  message, 
  elapsedSeconds, 
  onCancel,
  onPause,
  onResume,
  isPaused = false,
  interventionText = "",
  onInterventionChange,
  onInterventionSubmit
}: ProcessingModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-content processing-modal">
        <div className="processing-content">
          {!isPaused ? (
            <>
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
              <div className="processing-actions">
                {onPause && (
                  <button
                    className="pause-button primary"
                    onClick={onPause}
                    style={{ marginTop: "16px", marginRight: "8px" }}
                  >
                    ⏸️ {t("chat.processing.pause")}
                  </button>
                )}
                {onCancel && (
                  <button
                    className="cancel-button secondary"
                    onClick={onCancel}
                    style={{ marginTop: "16px" }}
                  >
                    {t("chat.processing.cancel")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="processing-paused">
                <span className="paused-icon">⏸️</span>
                <h3>{t("chat.processing.paused")}</h3>
              </div>
              <div className="processing-elapsed">{t("chat.processing.elapsedTime").replace("{elapsedSeconds}", elapsedSeconds.toString())}</div>
              
              <div className="intervention-section">
                <label className="intervention-label">{t("chat.processing.intervention")}</label>
                <textarea
                  className="intervention-input"
                  value={interventionText}
                  onChange={(e) => onInterventionChange?.(e.target.value)}
                  placeholder={t("chat.processing.interventionPlaceholder")}
                  rows={4}
                />
              </div>
              
              <div className="processing-actions">
                {onInterventionSubmit && (
                  <button
                    className="resume-button primary"
                    onClick={onInterventionSubmit}
                    style={{ marginTop: "16px", marginRight: "8px" }}
                  >
                    ▶️ {t("chat.processing.interventionSubmit")}
                  </button>
                )}
                {onResume && (
                  <button
                    className="resume-button secondary"
                    onClick={onResume}
                    style={{ marginTop: "16px", marginRight: "8px" }}
                  >
                    ▶️ {t("chat.processing.resume")}
                  </button>
                )}
                {onCancel && (
                  <button
                    className="cancel-button secondary"
                    onClick={onCancel}
                    style={{ marginTop: "16px" }}
                  >
                    {t("chat.processing.cancel")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProcessingModal;