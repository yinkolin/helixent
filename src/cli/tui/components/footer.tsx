import { Box, Text } from "ink";

import { useAgentLoop } from "../hooks/use-agent-loop";
import { currentTheme } from "../themes";

export function Footer() {
  const { agent } = useAgentLoop();
  return (
    <Box paddingLeft={2}>
      <Text color={currentTheme.colors.dimText}>{agent.model.name}</Text>
    </Box>
  );
}
