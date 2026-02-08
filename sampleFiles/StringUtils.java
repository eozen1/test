// Good Code: String utility functions
package sampleFiles;

import java.util.ArrayList;
import java.util.List;

public class StringUtils {

    /**
     * Checks if a string is null or empty.
     * @param str the string to check
     * @return true if null or empty, false otherwise
     */
    public static boolean isNullOrEmpty(String str) {
        return str == null || str.isEmpty();
    }

    /**
     * Reverses a string.
     * @param str the string to reverse
     * @return reversed string
     * @throws IllegalArgumentException if str is null
     */
    public static String reverse(String str) {
        if (str == null) {
            throw new IllegalArgumentException("String cannot be null");
        }
        return new StringBuilder(str).reverse().toString();
    }

    /**
     * Splits a string into words.
     * @param str the string to split
     * @return list of words
     */
    public static List<String> splitWords(String str) {
        List<String> words = new ArrayList<>();
        if (isNullOrEmpty(str)) {
            return words;
        }

        String[] parts = str.trim().split("\\s+");
        for (String part : parts) {
            if (!part.isEmpty()) {
                words.add(part);
            }
        }
        return words;
    }

    /**
     * Capitalizes the first letter of each word.
     * @param str the string to capitalize
     * @return capitalized string
     */
    public static String capitalizeWords(String str) {
        if (isNullOrEmpty(str)) {
            return str;
        }

        StringBuilder result = new StringBuilder();
        boolean capitalizeNext = true;

        for (char c : str.toCharArray()) {
            if (Character.isWhitespace(c)) {
                capitalizeNext = true;
                result.append(c);
            } else if (capitalizeNext) {
                result.append(Character.toUpperCase(c));
                capitalizeNext = false;
            } else {
                result.append(Character.toLowerCase(c));
            }
        }

        return result.toString();
    }

    public static void main(String[] args) {
        System.out.println(reverse("hello"));
        System.out.println(capitalizeWords("hello world from java"));
        System.out.println(splitWords("one two three"));
    }
}
