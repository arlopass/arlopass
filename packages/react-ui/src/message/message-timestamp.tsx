"use client";

import { type HTMLAttributes, type ReactNode, type Ref } from "react";
import { createForwardRef } from "../utils/forward-ref.js";

type MessageTimestampProps = Omit<HTMLAttributes<HTMLTimeElement>, "children"> & {
  date: Date;
  format?: (date: Date) => string;
  children?: (date: Date) => ReactNode;
};

export const Timestamp = createForwardRef<HTMLTimeElement, MessageTimestampProps>(
  "Message.Timestamp",
  ({ date, format, children, ...rest }, ref: Ref<HTMLTimeElement>) => {
    const isoString = date.toISOString();

    return (
      <time ref={ref} dateTime={isoString} data-timestamp={isoString} {...rest}>
        {children ? children(date) : format ? format(date) : isoString}
      </time>
    );
  },
);
