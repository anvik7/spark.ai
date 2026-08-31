import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Spark React ErrorBoundary Caught Error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "var(--surface-2, #F8F9FA)",
            color: "var(--ink, #0D1117)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center",
          }}
        >
          <div
            style={{
              maxWidth: 460,
              width: "100%",
              background: "#ffffff",
              border: "1px solid #E5E7EB",
              borderRadius: 16,
              padding: 28,
              boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px", color: "#0D1117" }}>
              Something went wrong loading Spark
            </h2>
            <p style={{ fontSize: 13.5, color: "#57606A", lineHeight: 1.5, margin: "0 0 20px" }}>
              An unexpected error occurred while rendering the workspace. Please reload to restore your session.
            </p>
            {this.state.error?.message && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12,
                  color: "#DC2626",
                  marginBottom: 20,
                  textAlign: "left",
                  wordBreak: "break-word",
                  fontFamily: "monospace",
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReload}
              style={{
                width: "100%",
                padding: "10px 20px",
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reload Spark Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
