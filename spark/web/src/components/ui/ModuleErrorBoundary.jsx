import React from "react";

export default class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ModuleErrorBoundary] Error in module '${this.props.moduleName || "Unknown"}':`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      const moduleName = this.props.moduleName || "This module";
      return (
        <div
          style={{
            padding: "32px 20px",
            margin: "20px auto",
            maxWidth: 520,
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: 14,
            textAlign: "center",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>
            {moduleName} couldn't load
          </h2>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 16px", lineHeight: 1.5 }}>
            A temporary issue occurred while loading this section. The rest of Spark remains fully usable.
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              border: "none",
              background: "var(--p-gradient)",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
