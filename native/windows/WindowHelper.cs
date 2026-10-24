using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Fixed, local-only metadata/focus adapter. No app-content, layout, keyboard or shell API.
internal static class WindowHelper
{
    private const int GwlExStyle = -20;
    private const long WsExToolWindow = 0x00000080L;
    private const uint GwOwner = 4;
    private const int DwmwaCloaked = 14;
    private const int MaxTitleLength = 500;
    private const string UtcFormat = "yyyy-MM-dd'T'HH:mm:ss.fff'Z'";
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

    private delegate bool EnumWindowsCallback(IntPtr handle, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsCallback callback, IntPtr parameter);
    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern IntPtr GetWindow(IntPtr handle, uint command);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong32(IntPtr handle, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLong64(IntPtr handle, int index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr handle, StringBuilder title, int maximumCount);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr handle, StringBuilder className, int maximumCount);
    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr handle, int attribute, out int value, int valueSize);

    private sealed class WindowMetadata
    {
        public string handle { get; set; }
        public int processId { get; set; }
        public string processStartedAt { get; set; }
        public string title { get; set; }
        public string appName { get; set; }
        public bool active { get; set; }
    }

    public static int Main(string[] args)
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        try
        {
            if (args.Length == 1 && args[0] == "list")
                return ListWindows();
            if (args.Length == 4 && args[0] == "focus")
                return FocusWindow(args[1], args[2], args[3]);
            return Failure("VALIDATION_ERROR", "Use list or focus <handle> <expectedPid> <expectedProcessStartedAt>.");
        }
        catch (Exception)
        {
            // Avoid writing arbitrary exception details, paths or process data to a caller.
            return Failure("INTERNAL_ERROR", "The Windows adapter could not complete the requested operation.");
        }
    }

    private static int ListWindows()
    {
        var windows = new List<WindowMetadata>();
        IntPtr foreground = GetForegroundWindow();
        int session = Process.GetCurrentProcess().SessionId;
        EnumWindowsCallback callback = delegate(IntPtr handle, IntPtr unused)
        {
            WindowMetadata metadata = TryDescribe(handle, foreground, session);
            if (metadata != null)
                windows.Add(metadata);
            return true;
        };
        if (!EnumWindows(callback, IntPtr.Zero))
            return Failure("INTERNAL_ERROR", "Windows inventory enumeration failed.");
        windows.Sort(delegate(WindowMetadata a, WindowMetadata b)
        {
            return StringComparer.Ordinal.Compare(a.handle, b.handle);
        });
        Console.WriteLine(Json.Serialize(new { ok = true, windows = windows }));
        return 0;
    }

    private static WindowMetadata TryDescribe(IntPtr handle, IntPtr foreground, int session)
    {
        try
        {
            if (!IsWindow(handle) || !IsWindowVisible(handle)) return null;
            if ((GetExtendedStyle(handle) & WsExToolWindow) != 0) return null;
            if (GetWindow(handle, GwOwner) != IntPtr.Zero) return null;
            if (IsCloaked(handle) || IsShellWindow(handle)) return null;
            var title = new StringBuilder(MaxTitleLength + 1);
            if (GetWindowText(handle, title, title.Capacity) == 0) return null;
            string normalizedTitle = title.ToString().Trim();
            if (normalizedTitle.Length == 0) return null;
            uint processId;
            if (GetWindowThreadProcessId(handle, out processId) == 0 || processId == 0) return null;
            using (Process process = Process.GetProcessById(checked((int)processId)))
            {
                if (process.SessionId != session) return null;
                string startedAt = FormatUtc(process.StartTime);
                string appName = process.ProcessName;
                // Recheck binding after metadata reads because an HWND/PID can disappear or recycle.
                uint currentProcessId;
                if (!IsWindow(handle) || GetWindowThreadProcessId(handle, out currentProcessId) == 0 || currentProcessId != processId)
                    return null;
                return new WindowMetadata
                {
                    handle = handle.ToInt64().ToString(CultureInfo.InvariantCulture),
                    processId = checked((int)processId),
                    processStartedAt = startedAt,
                    title = normalizedTitle,
                    appName = appName,
                    active = handle == foreground
                };
            }
        }
        catch (System.ComponentModel.Win32Exception) { return null; }
        catch (InvalidOperationException) { return null; }
        catch (ArgumentException) { return null; }
        catch (System.Security.SecurityException) { return null; }
        catch (OverflowException) { return null; }
    }

    private static int FocusWindow(string handleArgument, string pidArgument, string startedAtArgument)
    {
        long numericHandle;
        int expectedPid;
        DateTimeOffset expectedStart;
        if (!Int64.TryParse(handleArgument, NumberStyles.None, CultureInfo.InvariantCulture, out numericHandle) || numericHandle <= 0 ||
            !Int32.TryParse(pidArgument, NumberStyles.None, CultureInfo.InvariantCulture, out expectedPid) || expectedPid <= 0 ||
            !DateTimeOffset.TryParseExact(startedAtArgument, UtcFormat, CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out expectedStart))
            return Failure("VALIDATION_ERROR", "Focus requires a positive decimal handle, process ID and the exact UTC process-start timestamp from list.");

        IntPtr handle;
        try { handle = new IntPtr(numericHandle); }
        catch (OverflowException) { return Failure("VALIDATION_ERROR", "Window handle is outside the supported range."); }
        if (!IsWindow(handle))
            return Failure("NOT_FOUND", "The selected native window no longer exists.");

        WindowMetadata actual = TryDescribe(handle, GetForegroundWindow(), Process.GetCurrentProcess().SessionId);
        if (actual == null || actual.processId != expectedPid || actual.processStartedAt != expectedStart.UtcDateTime.ToString(UtcFormat, CultureInfo.InvariantCulture))
            return Failure("STALE_STATE", "The native window binding changed or is no longer accessible; refresh the inventory.");
        if (IsIconic(handle))
            return Failure("FOCUS_DENIED", "The selected native window is minimized; restore it manually before focusing it.");
        if (GetForegroundWindow() == handle)
        {
            Console.WriteLine("{\"ok\":true}");
            return 0;
        }

        // No activation-policy workarounds, input injection or changes to window layout/state.
        if (!SetForegroundWindow(handle))
            return Failure("FOCUS_DENIED", "Windows denied foreground activation; choose the window manually.");
        for (int attempt = 0; attempt < 5; attempt++)
        {
            if (GetForegroundWindow() == handle)
            {
                Console.WriteLine("{\"ok\":true}");
                return 0;
            }
            Thread.Sleep(20);
        }
        return Failure("FOCUS_DENIED", "The requested window did not become the foreground window.");
    }

    private static long GetExtendedStyle(IntPtr handle)
    {
        return IntPtr.Size == 8 ? GetWindowLong64(handle, GwlExStyle).ToInt64() : GetWindowLong32(handle, GwlExStyle);
    }

    private static bool IsCloaked(IntPtr handle)
    {
        try
        {
            int cloaked;
            return DwmGetWindowAttribute(handle, DwmwaCloaked, out cloaked, sizeof(int)) == 0 && cloaked != 0;
        }
        catch (DllNotFoundException) { return false; }
        catch (EntryPointNotFoundException) { return false; }
    }

    private static bool IsShellWindow(IntPtr handle)
    {
        var className = new StringBuilder(256);
        GetClassName(handle, className, className.Capacity);
        string name = className.ToString();
        return name == "Progman" || name == "WorkerW" || name == "Shell_TrayWnd" || name == "Shell_SecondaryTrayWnd";
    }

    private static string FormatUtc(DateTime value)
    {
        return value.ToUniversalTime().ToString(UtcFormat, CultureInfo.InvariantCulture);
    }

    private static int Failure(string code, string message)
    {
        Console.WriteLine(Json.Serialize(new { ok = false, code = code, message = message }));
        return 1;
    }
}
